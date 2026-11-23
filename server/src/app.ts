import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from 'fastify'
import type { Config } from './config.js'
import { AppError, toErrorBody } from './lib/errors.js'
import { buildLoggerOptions } from './lib/logger.js'
import { registerHealthRoutes } from './routes/health.js'

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS']
const ALLOWED_HEADERS = ['content-type', 'authorization', 'x-request-id']

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent' ? false : buildLoggerOptions(config.LOG_LEVEL),
    genReqId: () => randomUUID(),
  })

  await app.register(cors, {
    origin(origin, callback) {
      // Requests without an Origin header are not subject to CORS (curl, health
      // probes, server-to-server) and are allowed through untouched.
      if (!origin) {
        callback(null, false)
        return
      }
      callback(null, config.ADDIN_ORIGINS.includes(origin))
    },
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: 600,
    credentials: false,
  })

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    // Responses contain mailbox state; never let a proxy or browser cache them.
    reply.header('cache-control', 'no-store')
  })

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { code: error.code, statusCode: error.statusCode },
        'request rejected',
      )
      reply.code(error.statusCode).send(toErrorBody(error, request.id))
      return
    }

    if (error.validation) {
      const invalid = new AppError('INVALID_REQUEST', 'Invalid request', {
        retryable: false,
      })
      reply.code(invalid.statusCode).send(toErrorBody(invalid, request.id))
      return
    }

    // Unexpected: log the details (never a response body) and answer generically.
    request.log.error(
      { err: { name: error.name, message: error.message, stack: error.stack } },
      'unhandled error',
    )
    const internal = new AppError('INTERNAL', 'Internal server error')
    reply.code(internal.statusCode).send(toErrorBody(internal, request.id))
  })

  app.setNotFoundHandler((request, reply) => {
    const notFound = new AppError('NOT_FOUND', 'Not found', { retryable: false })
    reply.code(notFound.statusCode).send(toErrorBody(notFound, request.id))
  })

  await registerHealthRoutes(app)

  return app
}

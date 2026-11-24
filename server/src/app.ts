import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from 'fastify'
import type { Config } from './config.js'
import { createVacationDeps } from './deps.js'
import { AppError, toErrorBody } from './lib/errors.js'
import { buildLoggerOptions } from './lib/logger.js'
import { registerHealthRoutes } from './routes/health.js'
import { registerManifestRoute, type ManifestOptions } from './routes/manifest.js'
import { registerVacationRoutes, type VacationRouteDeps } from './routes/vacation.js'

const ALLOWED_METHODS = ['GET', 'PUT', 'POST', 'OPTIONS']
const ALLOWED_HEADERS = ['content-type', 'authorization', 'x-request-id']

/** Only what is useful for diagnosis; the stack never reaches a log line. */
function describeCause(cause: unknown): string | undefined {
  if (!(cause instanceof Error)) {
    return undefined
  }
  const code = (cause as NodeJS.ErrnoException).code
  return code ? `${code}: ${cause.message}` : cause.message
}

export interface AppDependencies {
  vacation: VacationRouteDeps
  manifest: ManifestOptions
}

export async function buildApp(
  config: Config,
  dependencies: Partial<AppDependencies> = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent' ? false : buildLoggerOptions(config.LOG_LEVEL),
    genReqId: () => randomUUID(),
    trustProxy: config.TRUST_PROXY,
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
        {
          code: error.code,
          statusCode: error.statusCode,
          cause: describeCause(error.cause),
        },
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

    // Other Fastify client errors: unparseable JSON, wrong content type, body
    // too large. Keep the status, normalise the body.
    if (
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const invalid = new AppError('INVALID_REQUEST', 'Invalid request', {
        retryable: false,
      })
      request.log.warn(
        { code: error.code, detail: error.message },
        'client request rejected',
      )
      reply.code(error.statusCode).send(toErrorBody(invalid, request.id))
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
  await registerVacationRoutes(app, dependencies.vacation ?? createVacationDeps(config))

  if (dependencies.manifest) {
    registerManifestRoute(app, dependencies.manifest)
  } else if (config.PUBLIC_BASE_URL) {
    const template = await readFile(resolve(config.MANIFEST_TEMPLATE_PATH), 'utf8')
    registerManifestRoute(app, { template, baseUrl: config.PUBLIC_BASE_URL })
  }

  // @fastify/static refuses a relative root, so resolve it against the working
  // directory (which is the image's /app in production).
  const staticDir = resolve(config.STATIC_DIR)
  if (existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      index: ['index.html'],
      setHeaders(response, path) {
        // Some hosts and browsers refuse an installable manifest served as
        // application/octet-stream.
        if (path.endsWith('.webmanifest')) {
          response.header('content-type', 'application/manifest+json; charset=utf-8')
        }
      },
    })
  }

  return app
}

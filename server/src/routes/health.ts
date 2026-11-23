import type { FastifyInstance } from 'fastify'
import { SERVICE_VERSION } from '../version.js'

const healthResponseSchema = {
  type: 'object',
  required: ['status', 'version', 'uptime'],
  additionalProperties: false,
  properties: {
    status: { type: 'string', const: 'ok' },
    version: { type: 'string' },
    uptime: { type: 'number' },
  },
} as const

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      version: SERVICE_VERSION,
      uptime: Math.round(process.uptime()),
    }),
  )
}

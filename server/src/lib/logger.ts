import type { FastifyServerOptions } from 'fastify'

/**
 * Every path here is a value that must never reach a log sink or a log aggregator.
 * Request bodies carry mailbox passwords, so both the top-level and nested
 * `*.password` forms are listed.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'body.password',
  'body.currentPassword',
  'currentPassword',
  'authorization',
  '*.authorization',
]

export function buildLoggerOptions(
  level: string,
): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level,
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[redacted]',
    },
  }
}

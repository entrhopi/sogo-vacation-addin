import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { buildLoggerOptions } from '../src/lib/logger.js'

function readLines(write: (line: string) => void) {
  const log = pino(
    buildLoggerOptions('info') as pino.LoggerOptions,
    { write },
  )
  return log
}

describe('logger redaction', () => {
  it('removes credentials from structured log fields', () => {
    const output: string[] = []
    const log = readLines((line) => output.push(line))

    log.info(
      {
        password: 'top-secret-password',
        body: { password: 'body-secret', currentPassword: 'old-secret' },
        req: {
          headers: {
            authorization: 'Basic dXNlcjpwYXNz',
            cookie: 'MCSESSID=session-secret',
          },
        },
        nested: { authorization: 'Bearer nested-secret' },
      },
      'sensitive payload',
    )

    const text = output.join('')

    expect(text).not.toContain('top-secret-password')
    expect(text).not.toContain('body-secret')
    expect(text).not.toContain('old-secret')
    expect(text).not.toContain('dXNlcjpwYXNz')
    expect(text).not.toContain('session-secret')
    expect(text).not.toContain('nested-secret')
    expect(text).toContain('[redacted]')
    expect(text).toContain('sensitive payload')
  })

  it('keeps harmless fields intact', () => {
    const output: string[] = []
    const log = readLines((line) => output.push(line))

    log.info({ code: 'BAD_CREDENTIALS', mailbox: 'user@example.org' }, 'rejected')

    const text = output.join('')
    expect(text).toContain('BAD_CREDENTIALS')
    expect(text).toContain('user@example.org')
  })
})

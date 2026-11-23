import { describe, expect, it } from 'vitest'
import { ALLOWED_ORIGIN, makeApp } from './helpers.js'

describe('CORS', () => {
  it('allows the configured add-in origin', async () => {
    const { app } = await makeApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED_ORIGIN },
    })

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    await app.close()
  })

  it('does not grant access to an unknown origin', async () => {
    const { app } = await makeApp()
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    await app.close()
  })

  it('answers preflight for an allowed origin', async () => {
    const { app } = await makeApp()
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: ALLOWED_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,authorization',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN)
    expect(response.headers['access-control-allow-methods']).toContain('POST')
    await app.close()
  })

  it('allows requests without an Origin header', async () => {
    const { app } = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    await app.close()
  })
})

import { describe, expect, it } from 'vitest'
import { AppError } from '../src/lib/errors.js'
import { makeApp } from './helpers.js'

describe('error contract', () => {
  it('returns a non-retryable envelope for bad credentials', async () => {
    const { app } = await makeApp()
    app.get('/bad-credentials', async () => {
      throw new AppError('BAD_CREDENTIALS', 'Wrong username or password.')
    })

    const response = await app.inject({ method: 'GET', url: '/bad-credentials' })

    expect(response.statusCode).toBe(401)
    const body = response.json()
    expect(body.error).toMatchObject({
      code: 'BAD_CREDENTIALS',
      message: 'Wrong username or password.',
      retryable: false,
    })
    expect(body.error.requestId).toEqual(expect.any(String))
    await app.close()
  })

  it('marks upstream outages as retryable', async () => {
    const { app } = await makeApp()
    app.get('/sogo-down', async () => {
      throw new AppError('SOGO_UNAVAILABLE', 'SOGo is unavailable.')
    })

    const response = await app.inject({ method: 'GET', url: '/sogo-down' })

    expect(response.statusCode).toBe(503)
    expect(response.json().error).toMatchObject({
      code: 'SOGO_UNAVAILABLE',
      retryable: true,
    })
    await app.close()
  })

  it('never leaks internal error details', async () => {
    const { app } = await makeApp()
    app.get('/boom', async () => {
      throw new Error('kaboom: super-secret-value')
    })

    const response = await app.inject({ method: 'GET', url: '/boom' })

    expect(response.statusCode).toBe(500)
    const raw = response.body
    expect(raw).not.toContain('super-secret-value')
    expect(raw).not.toContain('stack')
    expect(response.json().error).toMatchObject({
      code: 'INTERNAL',
      message: 'Internal server error',
      retryable: true,
    })
    await app.close()
  })

  it('answers unknown routes with a 404 envelope', async () => {
    const { app } = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(response.statusCode).toBe(404)
    expect(response.json().error).toMatchObject({
      code: 'NOT_FOUND',
      retryable: false,
    })
    await app.close()
  })

  it('maps schema validation failures to INVALID_REQUEST', async () => {
    const { app } = await makeApp()
    app.post(
      '/validated',
      {
        schema: {
          body: {
            type: 'object',
            required: ['message'],
            properties: { message: { type: 'string' } },
          },
        },
      },
      async () => ({ ok: true }),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/validated',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatchObject({
      code: 'INVALID_REQUEST',
      retryable: false,
    })
    await app.close()
  })
})

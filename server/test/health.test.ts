import { describe, expect, it } from 'vitest'
import { makeApp } from './helpers.js'

describe('GET /health', () => {
  it('reports status, version and uptime', async () => {
    const { app } = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toMatchObject({ status: 'ok', version: expect.any(String) })
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)

    await app.close()
  })

  it('sends security and no-store headers', async () => {
    const { app } = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
    expect(response.headers['cache-control']).toBe('no-store')

    await app.close()
  })
})

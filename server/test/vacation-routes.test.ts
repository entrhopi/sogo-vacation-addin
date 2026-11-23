import { describe, expect, it, vi } from 'vitest'
import { LoginFailureGuard } from '../src/http/rate-limit.js'
import { AppError } from '../src/lib/errors.js'
import type { VacationRouteDeps } from '../src/routes/vacation.js'
import { makeApp } from './helpers.js'

const MAILBOX = 'user@example.org'
const PASSWORD = 's3cret'
const AUTHORIZATION = `Basic ${Buffer.from(`${MAILBOX}:${PASSWORD}`).toString('base64')}`

const STORED = {
  enabled: 0,
  autoReplyText: 'old',
  customSubjectEnabled: 1,
  customSubject: 'Old subject',
  weekdaysEnabled: 1,
  days: ['monday'],
}

interface Harness {
  deps: VacationRouteDeps
  getVacation: ReturnType<typeof vi.fn>
  saveVacation: ReturnType<typeof vi.fn>
  verifyCredentials: ReturnType<typeof vi.fn>
}

function harness(options: { stored?: unknown; failures?: LoginFailureGuard } = {}): Harness {
  const getVacation = vi.fn(async () => options.stored ?? null)
  const saveVacation = vi.fn(async () => undefined)
  const verifyCredentials = vi.fn(async () => undefined)

  const deps: VacationRouteDeps = {
    sogo: { getVacation, saveVacation } as unknown as VacationRouteDeps['sogo'],
    verifyCredentials,
    failures: options.failures ?? new LoginFailureGuard(),
  }

  return { deps, getVacation, saveVacation, verifyCredentials }
}

describe('GET /api/vacation', () => {
  it('rejects a request without credentials before touching the backends', async () => {
    const { deps, verifyCredentials, getVacation } = harness()
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({ method: 'GET', url: '/api/vacation' })

    expect(response.statusCode).toBe(401)
    expect(response.json().error).toMatchObject({
      code: 'BAD_CREDENTIALS',
      retryable: false,
    })
    expect(response.headers['www-authenticate']).toBeUndefined()
    expect(verifyCredentials).not.toHaveBeenCalled()
    expect(getVacation).not.toHaveBeenCalled()
    await app.close()
  })

  it('rejects a username that is not a mailbox address', async () => {
    const { deps, verifyCredentials } = harness()
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'GET',
      url: '/api/vacation',
      headers: { authorization: `Basic ${Buffer.from('not-an-email:x').toString('base64')}` },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
    expect(verifyCredentials).not.toHaveBeenCalled()
    await app.close()
  })

  it('returns the normalised view and whether anything is stored', async () => {
    const { deps, verifyCredentials } = harness({ stored: STORED })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'GET',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.configured).toBe(true)
    expect(body.vacation).toMatchObject({
      enabled: false,
      autoReplyText: 'old',
      customSubjectEnabled: true,
      customSubject: 'Old subject',
      daysBetweenResponse: 7,
    })
    // Derived fields from SOGo's own UI are not part of the API view.
    expect(body.vacation).not.toHaveProperty('days')
    expect(verifyCredentials).toHaveBeenCalledWith({ mailbox: MAILBOX, password: PASSWORD })
    await app.close()
  })

  it('reports a mailbox with no vacation settings as not configured', async () => {
    const { deps } = harness({ stored: null })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'GET',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ configured: false, vacation: { enabled: false } })
    await app.close()
  })
})

describe('PUT /api/vacation', () => {
  it('merges the patch and keeps keys it does not know about', async () => {
    const { deps, saveVacation, verifyCredentials } = harness({ stored: STORED })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: { enabled: true, autoReplyText: 'Away until Friday' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().vacation).toMatchObject({
      enabled: true,
      autoReplyText: 'Away until Friday',
    })
    expect(verifyCredentials).toHaveBeenCalledTimes(1)
    expect(saveVacation).toHaveBeenCalledWith(
      { mailbox: MAILBOX, password: PASSWORD },
      {
        enabled: true,
        autoReplyText: 'Away until Friday',
        customSubjectEnabled: 1,
        customSubject: 'Old subject',
        weekdaysEnabled: 1,
        days: ['monday'],
      },
    )
    await app.close()
  })

  it('strips unknown fields instead of forwarding them to SOGo', async () => {
    const { deps, saveVacation } = harness({ stored: STORED })
    const { app } = await makeApp({}, { vacation: deps })

    await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: { enabled: true, somethingElse: 'injected' },
    })

    const saved = saveVacation.mock.calls[0]?.[1] as Record<string, unknown>
    expect(saved).not.toHaveProperty('somethingElse')
    await app.close()
  })

  it('rejects an empty patch', async () => {
    const { deps, saveVacation } = harness({ stored: STORED })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
    expect(saveVacation).not.toHaveBeenCalled()
    await app.close()
  })

  it('rejects an invalid time of day and names the field', async () => {
    const { deps } = harness({ stored: STORED })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: { startTimeEnabled: true, startTime: '25:00' },
    })

    expect(response.statusCode).toBe(400)
    const details = response.json().error.details as { path: string }[]
    expect(details.some((detail) => detail.path === 'startTime')).toBe(true)
    await app.close()
  })

  it('refuses a window that ends before it starts', async () => {
    const { deps, saveVacation } = harness({
      stored: { enabled: 0, endDateEnabled: 1, endDate: 1_000 },
    })
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: { startDateEnabled: true, startDate: 2_000 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toContain('start before it ends')
    expect(saveVacation).not.toHaveBeenCalled()
    await app.close()
  })

  it('does not touch SOGo when the password is rejected', async () => {
    const { deps, verifyCredentials, getVacation, saveVacation } = harness({ stored: STORED })
    verifyCredentials.mockRejectedValueOnce(
      new AppError('BAD_CREDENTIALS', 'Wrong username or password.', { retryable: false }),
    )
    const { app } = await makeApp({}, { vacation: deps })

    const response = await app.inject({
      method: 'PUT',
      url: '/api/vacation',
      headers: { authorization: AUTHORIZATION },
      payload: { enabled: true },
    })

    expect(response.statusCode).toBe(401)
    expect(getVacation).not.toHaveBeenCalled()
    expect(saveVacation).not.toHaveBeenCalled()
    expect(response.body).not.toContain(PASSWORD)
    await app.close()
  })

  it('locks out further attempts after repeated bad passwords', async () => {
    const failures = new LoginFailureGuard(2, 60_000, 60_000)
    const { deps, verifyCredentials } = harness({ stored: STORED, failures })
    verifyCredentials.mockRejectedValue(
      new AppError('BAD_CREDENTIALS', 'Wrong username or password.', { retryable: false }),
    )
    const { app } = await makeApp({}, { vacation: deps })

    const attempt = () =>
      app.inject({
        method: 'PUT',
        url: '/api/vacation',
        headers: { authorization: AUTHORIZATION },
        payload: { enabled: true },
      })

    expect((await attempt()).statusCode).toBe(401)
    expect((await attempt()).statusCode).toBe(401)
    const tripped = await attempt()

    expect(tripped.statusCode).toBe(429)
    expect(tripped.json().error).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    expect(verifyCredentials).toHaveBeenCalledTimes(2)
    await app.close()
  })
})

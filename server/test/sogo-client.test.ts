import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { AppError } from '../src/lib/errors.js'
import { SogoClient, type SogoCredentials } from '../src/sogo/client.js'
import { mergeVacation, type RawVacation } from '../src/sogo/vacation.js'

const defaultsFixture = JSON.parse(
  readFileSync(new URL('./fixtures/json-defaults.json', import.meta.url), 'utf8'),
) as RawVacation

const credentials: SogoCredentials = {
  mailbox: 'user@example.org',
  password: 'p@ss word',
}

interface RecordedRequest {
  method: string | undefined
  url: string | undefined
  headers: IncomingMessage['headers']
  body: string
}

interface Harness {
  url: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}

async function startSogo(
  handler: (request: RecordedRequest, response: ServerResponse) => void,
): Promise<Harness> {
  const requests: RecordedRequest[] = []
  const server = createServer((incoming, response) => {
    let body = ''
    incoming.on('data', (chunk) => {
      body += chunk.toString()
    })
    incoming.on('end', () => {
      const request: RecordedRequest = {
        method: incoming.method,
        url: incoming.url,
        headers: incoming.headers,
        body,
      }
      requests.push(request)
      handler(request, response)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

describe('SogoClient', () => {
  it('sends the proxy-auth headers and reads the vacation object', async () => {
    const harness = await startSogo((_request, response) => json(response, 200, defaultsFixture))
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })

    const vacation = await client.getVacation(credentials)

    expect(vacation).toEqual(defaultsFixture.Vacation)

    const [request] = harness.requests
    expect(request?.method).toBe('GET')
    expect(request?.url).toBe('/SOGo/so/user%40example.org/Preferences/jsonDefaults')
    expect(request?.headers['x-webobjects-remote-user']).toBe('user@example.org')
    expect(request?.headers['x-webobjects-auth-type']).toBe('Basic')
    expect(request?.headers.authorization).toBe(
      `Basic ${Buffer.from('user@example.org:p@ss word').toString('base64')}`,
    )
    expect(request?.url).not.toContain('p@ss')

    await harness.close()
  })

  it('returns null when the mailbox never configured a vacation', async () => {
    const harness = await startSogo((_request, response) =>
      json(response, 200, { LocaleCode: 'en' }),
    )
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })

    await expect(client.getVacation(credentials)).resolves.toBeNull()
    await harness.close()
  })

  it('posts a full Vacation object to the save action', async () => {
    const harness = await startSogo((_request, response) => {
      response.writeHead(200)
      response.end()
    })
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })
    const vacation = mergeVacation(defaultsFixture.Vacation as RawVacation, {
      enabled: true,
      autoReplyText: 'Away',
    })

    await client.saveVacation(credentials, vacation)

    const [request] = harness.requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('/SOGo/so/user%40example.org/Preferences/save')
    expect(request?.headers['content-type']).toBe('application/json')
    expect(JSON.parse(request?.body ?? '')).toEqual({
      defaults: { Vacation: vacation },
    })
    // Unknown SOGo keys survive the round trip.
    expect(vacation.weekdaysEnabled).toBe(0)
    expect(vacation.days).toEqual([])

    await harness.close()
  })

  it('maps a 503 to a retryable SOGO_UNAVAILABLE', async () => {
    const harness = await startSogo((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end('{"message":"Service temporarily unavailable"}')
    })
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })

    const error = await client.getVacation(credentials).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'SOGO_UNAVAILABLE',
      retryable: true,
      statusCode: 503,
    })
    await harness.close()
  })

  it('maps 401/403/404 to a non-retryable MAILBOX_NOT_FOUND', async () => {
    for (const status of [401, 403, 404]) {
      const harness = await startSogo((_request, response) => {
        response.writeHead(status)
        response.end()
      })
      const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })

      const error = await client.getVacation(credentials).catch((caught: unknown) => caught)

      expect(error).toMatchObject({
        code: 'MAILBOX_NOT_FOUND',
        retryable: false,
        statusCode: 404,
      })
      await harness.close()
    }
  })

  it('turns a timeout into SOGO_UNAVAILABLE instead of hanging', async () => {
    const harness = await startSogo(() => {
      // never answer
    })
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 50 })

    const error = await client.getVacation(credentials).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'SOGO_UNAVAILABLE', retryable: true })
    expect((error as AppError).message).toContain('did not respond in time')
    await harness.close()
  })

  it('turns an unreachable host into SOGO_UNAVAILABLE', async () => {
    const harness = await startSogo((_request, response) => json(response, 200, {}))
    const { url } = harness
    await harness.close()

    const client = new SogoClient({ baseUrl: url, timeoutMs: 200 })
    const error = await client.getVacation(credentials).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'SOGO_UNAVAILABLE', retryable: true })
  })

  it('rejects a payload that is not a defaults object', async () => {
    const harness = await startSogo((_request, response) => json(response, 200, ['nope']))
    const client = new SogoClient({ baseUrl: harness.url, timeoutMs: 1_000 })

    const error = await client.getVacation(credentials).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'SOGO_UNAVAILABLE' })
    await harness.close()
  })
})

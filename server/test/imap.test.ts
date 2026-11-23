import { createServer, type Server, type Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { verifyMailboxCredentials, type ImapEndpoint } from '../src/auth/imap.js'
import { AppError } from '../src/lib/errors.js'

interface FakeImap {
  port: number
  lines: string[]
  readonly connections: number
  close: () => Promise<void>
}

interface FakeImapOptions {
  greeting?: string | null
  onCommand?: (line: string, reply: (line: string) => void) => void
}

async function startFakeImap(options: FakeImapOptions = {}): Promise<FakeImap> {
  const sockets = new Set<Socket>()
  const lines: string[] = []
  let connections = 0

  const server: Server = createServer((socket) => {
    connections += 1
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})

    const greeting = options.greeting === undefined ? '* OK fake Dovecot ready' : options.greeting
    if (greeting !== null) {
      socket.write(`${greeting}\r\n`)
    }

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let index = buffer.indexOf('\r\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (line.length > 0) {
          lines.push(line)
          options.onCommand?.(line, (reply) => socket.write(`${reply}\r\n`))
        }
        index = buffer.indexOf('\r\n')
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  return {
    port,
    lines,
    get connections() {
      return connections
    },
    close: async () => {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

const endpointFor = (port: number, timeoutMs = 1_000): ImapEndpoint => ({
  host: '127.0.0.1',
  port,
  security: 'none',
  timeoutMs,
})

const credentials = { username: 'user@example.org', password: 'p@ss word' }

describe('verifyMailboxCredentials', () => {
  it('logs in once and succeeds on OK', async () => {
    const server = await startFakeImap({
      onCommand: (line, reply) => {
        if (line.startsWith('a2 LOGIN')) {
          reply('a2 OK Logged in')
        }
      },
    })

    await expect(verifyMailboxCredentials(endpointFor(server.port), credentials)).resolves.toBeUndefined()

    const logins = server.lines.filter((line) => line.startsWith('a2 LOGIN'))
    expect(logins).toHaveLength(1)
    expect(logins[0]).toBe('a2 LOGIN "user@example.org" "p@ss word"')
    await server.close()
  })

  it('escapes quotes and backslashes in credentials', async () => {
    const server = await startFakeImap({
      onCommand: (line, reply) => {
        if (line.startsWith('a2 LOGIN')) {
          reply('a2 OK Logged in')
        }
      },
    })

    await verifyMailboxCredentials(endpointFor(server.port), {
      username: 'user@example.org',
      password: 'pa"ss\\word',
    })

    expect(server.lines[0]).toBe('a2 LOGIN "user@example.org" "pa\\"ss\\\\word"')
    await server.close()
  })

  it('maps NO to BAD_CREDENTIALS and never retries', async () => {
    const server = await startFakeImap({
      onCommand: (line, reply) => {
        if (line.startsWith('a2 LOGIN')) {
          reply('a2 NO [AUTHENTICATIONFAILED] Invalid credentials')
        }
      },
    })

    const error = await verifyMailboxCredentials(endpointFor(server.port), credentials).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'BAD_CREDENTIALS',
      retryable: false,
      statusCode: 401,
    })
    expect(server.lines.filter((line) => line.startsWith('a2 LOGIN'))).toHaveLength(1)
    await server.close()
  })

  it('reports an unreachable server as IMAP_UNAVAILABLE', async () => {
    const server = await startFakeImap()
    const { port } = server
    await server.close()

    const error = await verifyMailboxCredentials(endpointFor(port, 200), credentials).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE', retryable: true })
  })

  it('times out instead of hanging when the server never greets', async () => {
    const server = await startFakeImap({ greeting: null })

    const started = Date.now()
    const error = await verifyMailboxCredentials(endpointFor(server.port, 100), credentials).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE', retryable: true })
    expect((error as AppError).message).toContain('did not respond in time')
    expect(Date.now() - started).toBeLessThan(2_000)
    await server.close()
  })

  it('rejects credentials that could inject an IMAP command', async () => {
    const error = await verifyMailboxCredentials(endpointFor(1, 200), {
      username: 'user@example.org',
      password: 'x\r\na3 DELETE INBOX',
    }).catch((caught: unknown) => caught)

    // Port 1 is closed, so an IMAP_UNAVAILABLE would mean a connection was
    // attempted; INVALID_REQUEST proves the payload was rejected first.
    expect(error).toMatchObject({ code: 'INVALID_REQUEST', retryable: false })
  })

  it('fails cleanly when the server refuses STARTTLS', async () => {
    const server = await startFakeImap({
      onCommand: (line, reply) => {
        if (line.startsWith('a1 STARTTLS')) {
          reply('a1 NO STARTTLS not available')
        }
      },
    })

    const error = await verifyMailboxCredentials(
      { ...endpointFor(server.port), security: 'starttls' },
      credentials,
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE' })
    expect((error as AppError).message).toContain('STARTTLS')
    await server.close()
  })

  it('reports a non-OK greeting as IMAP_UNAVAILABLE', async () => {
    const server = await startFakeImap({ greeting: '* BYE shutting down' })

    const error = await verifyMailboxCredentials(endpointFor(server.port), credentials).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE' })
    await server.close()
  })
})

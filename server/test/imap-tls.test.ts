import { readFileSync } from 'node:fs'
import { createServer, type Server, type TLSSocket } from 'node:tls'
import { describe, expect, it } from 'vitest'
import { verifyMailboxCredentials, type ImapEndpoint } from '../src/auth/imap.js'

const key = readFileSync(new URL('./fixtures/tls/key.pem', import.meta.url), 'utf8')
const cert = readFileSync(new URL('./fixtures/tls/cert.pem', import.meta.url), 'utf8')

interface TlsServer {
  port: number
  close: () => Promise<void>
}

async function startTlsImap(): Promise<TlsServer> {
  const sockets = new Set<TLSSocket>()
  const server: Server = createServer({ key, cert }, (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.write('* OK fake TLS Dovecot ready\r\n')

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let index = buffer.indexOf('\r\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (line.startsWith('a2 LOGIN')) {
          socket.write('a2 OK Logged in\r\n')
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
    close: async () => {
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function endpoint(port: number, tls: ImapEndpoint['tls']): ImapEndpoint {
  return { host: '127.0.0.1', port, security: 'tls', timeoutMs: 1_000, tls }
}

const credentials = { username: 'user@example.org', password: 'secret' }

describe('IMAP over TLS', () => {
  it('verifies the certificate name while connecting to a different host', async () => {
    // This is the Mailcow setup: connect to the "dovecot" alias, certificate
    // issued for the public mail hostname.
    const server = await startTlsImap()

    await expect(
      verifyMailboxCredentials(endpoint(server.port, { servername: 'test.local', ca: cert }), credentials),
    ).resolves.toBeUndefined()

    await server.close()
  })

  it('rejects a certificate issued for another name', async () => {
    const server = await startTlsImap()

    const error = await verifyMailboxCredentials(
      endpoint(server.port, { servername: 'wrong.local', ca: cert }),
      credentials,
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE', retryable: true })
    expect((error as Error & { cause?: NodeJS.ErrnoException }).cause?.code).toBe(
      'ERR_TLS_CERT_ALTNAME_INVALID',
    )
    await server.close()
  })

  it('rejects an untrusted certificate by default', async () => {
    const server = await startTlsImap()

    const error = await verifyMailboxCredentials(
      endpoint(server.port, { servername: 'test.local' }),
      credentials,
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 'IMAP_UNAVAILABLE' })
    await server.close()
  })

  it('can be told to skip verification when the deployment requires it', async () => {
    const server = await startTlsImap()

    await expect(
      verifyMailboxCredentials(
        endpoint(server.port, { servername: 'test.local', rejectUnauthorized: false }),
        credentials,
      ),
    ).resolves.toBeUndefined()

    await server.close()
  })
})

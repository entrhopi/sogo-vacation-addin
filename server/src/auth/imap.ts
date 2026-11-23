import { connect as connectTcp, type Socket } from 'node:net'
import { connect as connectTls, type TLSSocket } from 'node:tls'
import { AppError } from '../lib/errors.js'

export type ImapSecurity = 'tls' | 'starttls' | 'none'

export interface ImapEndpoint {
  host: string
  port: number
  security: ImapSecurity
  timeoutMs: number
}

export interface MailboxCredentials {
  username: string
  password: string
}

type ImapStream = Socket | TLSSocket

const TIMEOUT_MESSAGE = 'IMAP server did not respond in time'
const UNREACHABLE_MESSAGE = 'Cannot reach the mail server'

/**
 * Buffers socket data and hands out complete CRLF-delimited lines.
 * IMAP is line based, so this is all the parsing the auth flow needs.
 */
class LineReader {
  private buffer = ''
  private readonly lines: string[] = []
  private failure: AppError | undefined
  private ended = false
  private wake: (() => void) | undefined

  constructor(socket: ImapStream) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string | Buffer) => {
      this.buffer += chunk.toString()
      let index = this.buffer.indexOf('\n')
      while (index >= 0) {
        this.lines.push(this.buffer.slice(0, index).replace(/\r$/, ''))
        this.buffer = this.buffer.slice(index + 1)
        index = this.buffer.indexOf('\n')
      }
      this.wakeUp()
    })
    socket.on('error', () => {
      this.failure = new AppError('IMAP_UNAVAILABLE', UNREACHABLE_MESSAGE)
      this.wakeUp()
    })
    socket.on('close', () => {
      this.ended = true
      this.wakeUp()
    })
  }

  async readLine(): Promise<string> {
    for (;;) {
      const line = this.lines.shift()
      if (line !== undefined) {
        return line
      }
      if (this.failure) {
        throw this.failure
      }
      if (this.ended) {
        throw new AppError('IMAP_UNAVAILABLE', 'IMAP connection closed unexpectedly')
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }

  private wakeUp(): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
}

/**
 * Rejects CR/LF/NUL outright: a credential that can inject a command line is a
 * bug upstream, not something to sanitise silently. Everything else is quoted
 * per RFC 3501, including backslash and double-quote escaping.
 */
function quote(value: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new AppError('INVALID_REQUEST', 'Credentials contain unsupported characters', {
      retryable: false,
    })
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function send(socket: ImapStream, line: string): void {
  socket.write(`${line}\r\n`)
}

/** Reads untagged responses until the line for `tag` arrives. */
async function readTagged(reader: LineReader, tag: string): Promise<string> {
  for (;;) {
    const line = await reader.readLine()
    if (line.startsWith(`${tag} `)) {
      return line
    }
    // Untagged capabilities / BYE etc. carry nothing we need during LOGIN.
  }
}

function open(endpoint: ImapEndpoint): Promise<ImapStream> {
  return new Promise((resolve, reject) => {
    const fail = (): void => {
      reject(new AppError('IMAP_UNAVAILABLE', UNREACHABLE_MESSAGE))
    }

    const socket: ImapStream =
      endpoint.security === 'tls'
        ? connectTls({ host: endpoint.host, port: endpoint.port, servername: endpoint.host })
        : connectTcp({ host: endpoint.host, port: endpoint.port })

    const timer = setTimeout(() => {
      socket.destroy()
      fail()
    }, endpoint.timeoutMs)
    timer.unref()

    const onReady = (): void => {
      clearTimeout(timer)
      socket.off('error', fail)
      resolve(socket)
    }

    socket.once('error', fail)
    if (endpoint.security === 'tls') {
      ;(socket as TLSSocket).once('secureConnect', onReady)
    } else {
      socket.once('connect', onReady)
    }
  })
}

function upgradeToTls(socket: ImapStream, endpoint: ImapEndpoint): Promise<ImapStream> {
  return new Promise((resolve, reject) => {
    const secure = connectTls({ socket, servername: endpoint.host })
    secure.once('secureConnect', () => resolve(secure))
    secure.once('error', () => {
      reject(new AppError('IMAP_UNAVAILABLE', 'TLS negotiation with the mail server failed'))
    })
  })
}

async function withTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout()
          reject(new AppError('IMAP_UNAVAILABLE', TIMEOUT_MESSAGE))
        }, timeoutMs)
        timer.unref()
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

/**
 * Proves that the mailbox password authenticates against Dovecot.
 *
 * This is the only authentication in the whole system: SOGo trusts the
 * proxy-auth header and never checks passwords, so a request that gets past
 * this function is allowed to act as that mailbox.
 *
 * Deliberately makes exactly one LOGIN attempt and never retries: Mailcow's
 * netfilter bans the source IP on repeated auth failures and Dovecot reports
 * each failed check, so a retry loop turns a typo into a lockout.
 */
export async function verifyMailboxCredentials(
  endpoint: ImapEndpoint,
  credentials: MailboxCredentials,
): Promise<void> {
  const username = quote(credentials.username)
  const password = quote(credentials.password)

  let socket: ImapStream | undefined
  try {
    await withTimeout(
      async () => {
        socket = await open(endpoint)
        let active = socket
        let reader = new LineReader(active)

        const greeting = await reader.readLine()
        if (/^\* PREAUTH\b/i.test(greeting)) {
          return
        }
        if (!/^\* OK\b/i.test(greeting)) {
          throw new AppError('IMAP_UNAVAILABLE', 'Unexpected IMAP greeting')
        }

        if (endpoint.security === 'starttls') {
          send(active, 'a1 STARTTLS')
          const reply = await readTagged(reader, 'a1')
          if (!/^a1 OK\b/i.test(reply)) {
            throw new AppError('IMAP_UNAVAILABLE', 'IMAP server refused STARTTLS')
          }
          active = await upgradeToTls(active, endpoint)
          socket = active
          reader = new LineReader(active)
        }

        send(active, `a2 LOGIN ${username} ${password}`)
        const reply = await readTagged(reader, 'a2')
        if (/^a2 OK\b/i.test(reply)) {
          send(active, 'a3 LOGOUT')
          return
        }
        if (/^a2 NO\b/i.test(reply)) {
          throw new AppError('BAD_CREDENTIALS', 'Wrong username or password.', {
            retryable: false,
          })
        }
        throw new AppError('IMAP_UNAVAILABLE', 'IMAP server rejected the login command')
      },
      endpoint.timeoutMs,
      () => socket?.destroy(),
    )
  } finally {
    socket?.destroy()
  }
}

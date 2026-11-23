import { AppError } from '../lib/errors.js'
import { isRawVacation, type RawVacation } from './vacation.js'

export interface SogoClientConfig {
  baseUrl: string
  timeoutMs: number
}

export interface SogoCredentials {
  mailbox: string
  password: string
}

/** Defensive cap: the defaults document is a few KB, not a data dump. */
const MAX_RESPONSE_BYTES = 1_000_000

function basicAuthorization(credentials: SogoCredentials): string {
  const pair = `${credentials.mailbox}:${credentials.password}`
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`
}

/**
 * SOGo on Mailcow runs with SOGoTrustProxyAuthentication. nginx normally feeds
 * it these three headers after the Mailcow session check; we do the same, with
 * the mailbox password the caller has already proven against Dovecot.
 *
 * The password is NOT verified by SOGo — it is only used by SOGo for its own
 * IMAP/Sieve connections. That is why `x-webobjects-auth-type` matters: without
 * it SOGo accepts read calls but cannot authenticate to ManageSieve, and
 * `Preferences/save` fails with 503 after having stored the values.
 */
function authHeaders(credentials: SogoCredentials): Record<string, string> {
  return {
    'x-webobjects-remote-user': credentials.mailbox,
    'x-webobjects-auth-type': 'Basic',
    authorization: basicAuthorization(credentials),
  }
}

function mapStatus(status: number): AppError | null {
  if (status >= 200 && status < 300) {
    return null
  }
  if (status === 401 || status === 403 || status === 404) {
    // SOGo's user view does not know this mailbox (aliases, disabled domains).
    return new AppError('MAILBOX_NOT_FOUND', 'This mailbox is not available in SOGo.', {
      retryable: false,
    })
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', 'Too many requests, try again shortly.')
  }
  if (status >= 500) {
    return new AppError('SOGO_UNAVAILABLE', 'SOGo is currently unavailable.')
  }
  return new AppError('INTERNAL', 'Unexpected response from SOGo.', { retryable: false })
}

/**
 * Thin, stateless client. Every call carries the mailbox credentials, so there
 * is no session to leak, expire or synchronise.
 */
export class SogoClient {
  constructor(
    private readonly config: SogoClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private preferencesUrl(mailbox: string, action: string): string {
    // SOGo's own Angular client percent-encodes the mailbox identically.
    const user = encodeURIComponent(mailbox)
    return `${this.config.baseUrl.replace(/\/+$/, '')}/SOGo/so/${user}/Preferences/${action}`
  }

  private async request(
    method: 'GET' | 'POST',
    url: string,
    credentials: SogoCredentials,
    payload?: unknown,
  ): Promise<string> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          ...authHeaders(credentials),
          accept: 'application/json',
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'error',
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AppError('SOGO_UNAVAILABLE', 'SOGo did not respond in time.')
      }
      throw new AppError('SOGO_UNAVAILABLE', 'Cannot reach SOGo.')
    }

    const failure = mapStatus(response.status)
    if (failure) {
      // Drain the body so the connection can be reused; never surface it.
      await response.text().catch(() => '')
      throw failure
    }

    const text = await response.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new AppError('SOGO_UNAVAILABLE', 'SOGo returned an unexpectedly large response.')
    }
    return text
  }

  /** Full user-defaults document, with the vacation state under `Vacation`. */
  async getDefaults(credentials: SogoCredentials): Promise<RawVacation> {
    const text = await this.request(
      'GET',
      this.preferencesUrl(credentials.mailbox, 'jsonDefaults'),
      credentials,
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new AppError('SOGO_UNAVAILABLE', 'SOGo returned an unreadable response.')
    }
    if (!isRawVacation(parsed)) {
      throw new AppError('SOGO_UNAVAILABLE', 'SOGo returned an unexpected payload.')
    }
    return parsed
  }

  /** Raw vacation object, or null when the mailbox never configured one. */
  async getVacation(credentials: SogoCredentials): Promise<RawVacation | null> {
    const defaults = await this.getDefaults(credentials)
    const vacation = defaults.Vacation
    if (vacation === undefined || vacation === null) {
      return null
    }
    if (!isRawVacation(vacation)) {
      throw new AppError('SOGO_UNAVAILABLE', 'SOGo returned an unexpected vacation payload.')
    }
    return vacation
  }

  /**
   * Replaces the `Vacation` object. Merge partial changes with `mergeVacation`
   * first — SOGo does not merge inside the object.
   */
  async saveVacation(credentials: SogoCredentials, vacation: RawVacation): Promise<void> {
    await this.request(
      'POST',
      this.preferencesUrl(credentials.mailbox, 'save'),
      credentials,
      { defaults: { Vacation: vacation } },
    )
  }
}

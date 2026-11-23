import { AppError } from '../lib/errors.js'

export interface BasicCredentials {
  mailbox: string
  password: string
}

/**
 * The add-in authenticates with plain Basic auth: the mailbox address as the
 * username, the mailbox password as the password. Basic auth is the right fit
 * here because the same pair is forwarded verbatim to SOGo, so there is exactly
 * one credential representation in the system.
 *
 * No `WWW-Authenticate` header is ever sent, so browsers in the Office webview
 * will not pop a native auth dialog on a 401.
 */
export function parseBasicAuthorization(header: string | undefined): BasicCredentials {
  const fail = (): never => {
    throw new AppError('BAD_CREDENTIALS', 'Mailbox credentials are required.', {
      retryable: false,
    })
  }

  if (!header) {
    return fail()
  }

  const separator = header.indexOf(' ')
  if (separator <= 0) {
    return fail()
  }
  const scheme = header.slice(0, separator)
  const encoded = header.slice(separator + 1).trim()
  if (scheme.toLowerCase() !== 'basic' || encoded.length === 0) {
    return fail()
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  if (colon <= 0) {
    return fail()
  }

  const mailbox = decoded.slice(0, colon).trim()
  const password = decoded.slice(colon + 1)
  if (mailbox.length === 0 || password.length === 0) {
    return fail()
  }

  return { mailbox, password }
}

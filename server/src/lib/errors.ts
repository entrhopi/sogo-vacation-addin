export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'BAD_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'SOGO_UNAVAILABLE'
  | 'INTERNAL'

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  BAD_CREDENTIALS: 401,
  RATE_LIMITED: 429,
  SOGO_UNAVAILABLE: 503,
  INTERNAL: 500,
}

/**
 * Credentials and upstream outages are retryable; a rejected request or a wrong
 * password is not. The add-in relies on this to decide between "show the error"
 * and "offer a retry", so never leave it to the caller to guess.
 */
const RETRYABLE_BY_CODE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'RATE_LIMITED',
  'SOGO_UNAVAILABLE',
  'INTERNAL',
])

export interface AppErrorOptions {
  retryable?: boolean
  details?: unknown
}

export class AppError extends Error {
  readonly statusCode: number
  readonly retryable: boolean
  readonly details?: unknown

  constructor(
    readonly code: ErrorCode,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = STATUS_BY_CODE[code]
    this.retryable = options.retryable ?? RETRYABLE_BY_CODE.has(code)
    if (options.details !== undefined) {
      this.details = options.details
    }
  }
}

export interface ErrorBody {
  error: {
    code: ErrorCode
    message: string
    retryable: boolean
    requestId: string
    details?: unknown
  }
}

export function toErrorBody(error: AppError, requestId: string): ErrorBody {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requestId,
    },
  }
  if (error.details !== undefined) {
    body.error.details = error.details
  }
  return body
}

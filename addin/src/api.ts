export interface VacationView {
  enabled: boolean
  autoReplyText: string
  customSubjectEnabled: boolean
  customSubject: string
  startDateEnabled: boolean
  startDate: number | null
  endDateEnabled: boolean
  endDate: number | null
  startTimeEnabled: boolean
  startTime: string | null
  endTimeEnabled: boolean
  endTime: string | null
  daysBetweenResponse: number
  autoReplyEmailAddresses: string[]
  ignoreLists: boolean
  alwaysSend: boolean
  discardMails: boolean
}

export interface VacationResponse {
  vacation: VacationView
  configured: boolean
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * `btoa` only handles Latin-1, and mailbox passwords may contain anything, so
 * encode the UTF-8 bytes explicitly before base64.
 */
function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function authorization(mailbox: string, password: string): string {
  return `Basic ${base64Utf8(`${mailbox}:${password}`)}`
}

async function request(
  method: 'GET' | 'PUT',
  mailbox: string,
  password: string,
  payload?: unknown,
): Promise<VacationResponse> {
  let response: Response
  try {
    response = await fetch('api/vacation', {
      method,
      headers: {
        authorization: authorization(mailbox, password),
        accept: 'application/json',
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
  } catch {
    throw new ApiError('NETWORK', 'Cannot reach the out-of-office service.', true)
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ApiError('UNEXPECTED', 'The service returned an unreadable response.')
  }

  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string; retryable?: boolean; details?: unknown } })
      .error
    throw new ApiError(
      error?.code ?? 'UNEXPECTED',
      error?.message ?? 'The request failed.',
      error?.retryable ?? false,
      error?.details,
    )
  }

  return parsed as VacationResponse
}

export function getVacation(mailbox: string, password: string): Promise<VacationResponse> {
  return request('GET', mailbox, password)
}

export function putVacation(
  mailbox: string,
  password: string,
  patch: Record<string, unknown>,
): Promise<VacationResponse> {
  return request('PUT', mailbox, password, patch)
}

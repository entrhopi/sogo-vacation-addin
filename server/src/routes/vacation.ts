import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseBasicAuthorization, type BasicCredentials } from '../http/auth.js'
import { FixedWindowLimiter, type LoginFailureGuard } from '../http/rate-limit.js'
import { AppError } from '../lib/errors.js'
import type { SogoClient } from '../sogo/client.js'
import {
  mergeVacation,
  toVacationView,
  vacationPatchSchema,
  type VacationPatch,
} from '../sogo/vacation.js'

export interface VacationRouteDeps {
  sogo: Pick<SogoClient, 'getVacation' | 'saveVacation'>
  verifyCredentials: (credentials: BasicCredentials) => Promise<void>
  failures: LoginFailureGuard
  requestsPerMinute?: number
}

const mailboxSchema = z.email()

function requireMailbox(credentials: BasicCredentials): void {
  if (!mailboxSchema.safeParse(credentials.mailbox).success) {
    throw new AppError('INVALID_REQUEST', 'The username must be a mailbox address.', {
      retryable: false,
    })
  }
}

/**
 * One IMAP check per request. Only a rejected password counts towards the
 * breaker: a mail server being down must not lock people out.
 */
async function authenticate(
  deps: VacationRouteDeps,
  credentials: BasicCredentials,
): Promise<void> {
  deps.failures.assertAllowed()
  try {
    await deps.verifyCredentials(credentials)
  } catch (error) {
    if (error instanceof AppError && error.code === 'BAD_CREDENTIALS') {
      deps.failures.recordFailure()
    }
    throw error
  }
  deps.failures.recordSuccess()
}

function parsePatch(body: unknown): VacationPatch {
  const result = vacationPatchSchema.safeParse(body)
  if (!result.success) {
    throw new AppError('INVALID_REQUEST', 'Invalid vacation settings.', {
      retryable: false,
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}

/** Cross-field rules that need the merged state, not just the patch. */
function assertDateOrder(merged: Record<string, unknown>): void {
  const start = merged.startDateEnabled ? merged.startDate : undefined
  const end = merged.endDateEnabled ? merged.endDate : undefined
  if (typeof start === 'number' && typeof end === 'number' && start > end) {
    throw new AppError('INVALID_REQUEST', 'The vacation must start before it ends.', {
      retryable: false,
      details: [{ path: 'endDate', message: 'Must not be before startDate' }],
    })
  }
}

export async function registerVacationRoutes(
  app: FastifyInstance,
  deps: VacationRouteDeps,
): Promise<void> {
  const limiter = new FixedWindowLimiter(60_000, deps.requestsPerMinute ?? 30)

  app.get('/api/vacation', async (request) => {
    limiter.take(request.ip)
    const credentials = parseBasicAuthorization(request.headers.authorization)
    requireMailbox(credentials)
    await authenticate(deps, credentials)

    const raw = await deps.sogo.getVacation(credentials)
    return {
      vacation: toVacationView(raw),
      configured: raw !== null,
    }
  })

  app.put('/api/vacation', async (request) => {
    limiter.take(request.ip)
    const credentials = parseBasicAuthorization(request.headers.authorization)
    requireMailbox(credentials)
    const patch = parsePatch(request.body)
    await authenticate(deps, credentials)

    const current = await deps.sogo.getVacation(credentials)
    const merged = mergeVacation(current, patch)
    assertDateOrder(merged)
    await deps.sogo.saveVacation(credentials, merged)

    request.log.info(
      { mailbox: credentials.mailbox, fields: Object.keys(patch) },
      'vacation settings saved',
    )

    return {
      vacation: toVacationView(merged),
      configured: true,
    }
  })
}

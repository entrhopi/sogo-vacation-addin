import { verifyMailboxCredentials } from './auth/imap.js'
import type { Config } from './config.js'
import { LoginFailureGuard } from './http/rate-limit.js'
import type { VacationRouteDeps } from './routes/vacation.js'
import { SogoClient } from './sogo/client.js'

export function createVacationDeps(config: Config): VacationRouteDeps {
  return {
    sogo: new SogoClient({
      baseUrl: config.SOGO_BASE_URL,
      timeoutMs: config.SOGO_TIMEOUT_MS,
    }),
    verifyCredentials: ({ mailbox, password }) =>
      verifyMailboxCredentials(
        {
          host: config.IMAP_HOST,
          port: config.IMAP_PORT,
          security: config.IMAP_SECURITY,
          timeoutMs: config.IMAP_TIMEOUT_MS,
        },
        { username: mailbox, password },
      ),
    failures: new LoginFailureGuard(),
  }
}

import { z } from 'zod'

/**
 * Configuration is read once at startup and fails fast. Keys are named after the
 * environment variables they come from so .env files and the schema stay in sync.
 */
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  ADDIN_ORIGINS: z
    .string()
    .default('https://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    )
    .pipe(z.array(z.url())),

  // SOGo runs inside the mailcow docker network; the public /SOGo route cannot
  // be used because nginx overwrites the proxy-auth headers with its own session.
  SOGO_BASE_URL: z.url().default('http://sogo:20000'),
  SOGO_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),

  // Credentials are verified against Dovecot before SOGo is touched, because
  // SOGo trusts the proxy header and does not check passwords itself.
  IMAP_HOST: z.string().min(1).default('dovecot'),
  IMAP_PORT: z.coerce.number().int().min(1).max(65_535).default(993),
  IMAP_SECURITY: z.enum(['tls', 'starttls', 'none']).default('tls'),
  IMAP_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),

  /**
   * Inside Mailcow the connection goes to the `dovecot` network alias, but
   * Dovecot serves the certificate of the public mail hostname. Verifying
   * against that hostname keeps chain validation intact, unlike disabling it.
   */
  IMAP_TLS_SERVERNAME: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  IMAP_TLS_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV === 'production' && config.IMAP_SECURITY === 'none') {
    ctx.addIssue({
      code: 'custom',
      path: ['IMAP_SECURITY'],
      message: 'plaintext IMAP is not allowed in production',
    })
  }
})

export type Config = z.infer<typeof ConfigSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid configuration: ${details}`)
  }
  return result.data
}

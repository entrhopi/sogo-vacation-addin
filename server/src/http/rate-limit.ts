import { AppError } from '../lib/errors.js'

/**
 * Fixed-window limiter, in memory. The middleware runs as a single container,
 * so a per-process counter is honest; if it is ever scaled out, this needs a
 * shared store or sticky routing, and that decision must not be silent.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): void {
    const current = this.now()
    const entry = this.hits.get(key)

    if (!entry || current >= entry.resetAt) {
      this.live().set(key, { count: 1, resetAt: current + this.windowMs })
      return
    }

    if (entry.count >= this.max) {
      throw new AppError('RATE_LIMITED', 'Too many requests, try again shortly.', {
        details: { retryAfterSeconds: Math.ceil((entry.resetAt - current) / 1000) },
      })
    }

    entry.count += 1
  }

  /** Drops expired keys so an attacker cannot grow the map without bound. */
  private live(): Map<string, { count: number; resetAt: number }> {
    const current = this.now()
    for (const [key, entry] of this.hits) {
      if (current >= entry.resetAt) {
        this.hits.delete(key)
      }
    }
    return this.hits
  }
}

/**
 * Circuit breaker for failed mailbox logins.
 *
 * This is not UX polish: every failed IMAP login is reported by Dovecot to
 * Mailcow's netfilter, which bans the *source IP* — and the source here is the
 * middleware container, which would take the service down for everyone. Five
 * consecutive failures trip a global cooldown, after which attempts resume.
 */
export class LoginFailureGuard {
  private failures: number[] = []
  private blockedUntil = 0

  constructor(
    private readonly threshold = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  assertAllowed(): void {
    const current = this.now()
    if (current < this.blockedUntil) {
      throw new AppError(
        'RATE_LIMITED',
        'Too many failed sign-ins. Try again in a moment.',
        {
          details: { retryAfterSeconds: Math.ceil((this.blockedUntil - current) / 1000) },
        },
      )
    }
  }

  recordFailure(): void {
    const current = this.now()
    this.failures = this.failures.filter((at) => current - at < this.windowMs)
    this.failures.push(current)
    if (this.failures.length >= this.threshold) {
      this.blockedUntil = current + this.cooldownMs
      this.failures = []
    }
  }

  recordSuccess(): void {
    this.failures = []
  }
}

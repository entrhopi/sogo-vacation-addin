import { describe, expect, it } from 'vitest'
import { FixedWindowLimiter, LoginFailureGuard } from '../src/http/rate-limit.js'

describe('FixedWindowLimiter', () => {
  it('allows up to the limit, then rejects until the window resets', () => {
    let now = 1_000
    const limiter = new FixedWindowLimiter(1_000, 2, () => now)

    limiter.take('1.2.3.4')
    limiter.take('1.2.3.4')
    expect(() => limiter.take('1.2.3.4')).toThrowError(/Too many requests/)

    now = 2_001
    expect(() => limiter.take('1.2.3.4')).not.toThrow()
  })

  it('counts each key separately', () => {
    const limiter = new FixedWindowLimiter(1_000, 1)

    limiter.take('a')
    expect(() => limiter.take('b')).not.toThrow()
    expect(() => limiter.take('a')).toThrowError(/Too many requests/)
  })
})

describe('LoginFailureGuard', () => {
  it('trips after the threshold and reports the cooldown', () => {
    let now = 10_000
    const guard = new LoginFailureGuard(3, 60_000, 30_000, () => now)

    guard.recordFailure()
    guard.recordFailure()
    expect(() => guard.assertAllowed()).not.toThrow()

    guard.recordFailure()
    expect(() => guard.assertAllowed()).toThrowError(/Too many failed sign-ins/)

    now += 30_001
    expect(() => guard.assertAllowed()).not.toThrow()
  })

  it('forgets failures outside the window', () => {
    let now = 0
    const guard = new LoginFailureGuard(2, 1_000, 30_000, () => now)

    guard.recordFailure()
    now = 2_000
    guard.recordFailure()
    expect(() => guard.assertAllowed()).not.toThrow()
  })

  it('a success clears accumulated failures', () => {
    const guard = new LoginFailureGuard(2, 60_000, 30_000)

    guard.recordFailure()
    guard.recordSuccess()
    guard.recordFailure()
    expect(() => guard.assertAllowed()).not.toThrow()
  })
})

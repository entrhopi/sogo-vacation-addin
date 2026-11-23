import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('applies sane defaults for the mailcow network', () => {
    const config = loadConfig({})

    expect(config.SOGO_BASE_URL).toBe('http://sogo:20000')
    expect(config.IMAP_HOST).toBe('dovecot')
    expect(config.IMAP_PORT).toBe(993)
    expect(config.IMAP_SECURITY).toBe('tls')
    expect(config.SOGO_TIMEOUT_MS).toBe(5_000)
  })

  it('splits and trims the add-in origin list', () => {
    const config = loadConfig({
      ADDIN_ORIGINS: ' https://a.example , https://b.example ',
    })

    expect(config.ADDIN_ORIGINS).toEqual(['https://a.example', 'https://b.example'])
  })

  it('refuses plaintext IMAP in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', IMAP_SECURITY: 'none' }),
    ).toThrowError(/plaintext IMAP is not allowed in production/)
  })

  it('allows plaintext IMAP outside production for local testing', () => {
    expect(loadConfig({ NODE_ENV: 'test', IMAP_SECURITY: 'none' }).IMAP_SECURITY).toBe('none')
  })

  it('reports which variable is wrong', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrowError(/PORT/)
  })
})

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

  it('defaults to verifying IMAP certificates', () => {
    const config = loadConfig({})

    expect(config.IMAP_TLS_REJECT_UNAUTHORIZED).toBe(true)
    expect(config.IMAP_TLS_SERVERNAME).toBeUndefined()
  })

  it('treats an empty TLS servername as unset so compose can pass an empty var', () => {
    expect(loadConfig({ IMAP_TLS_SERVERNAME: '' }).IMAP_TLS_SERVERNAME).toBeUndefined()
    expect(loadConfig({ IMAP_TLS_SERVERNAME: 'mail.example.org' }).IMAP_TLS_SERVERNAME).toBe(
      'mail.example.org',
    )
  })

  it('parses the verification switch', () => {
    expect(loadConfig({ IMAP_TLS_REJECT_UNAUTHORIZED: 'false' }).IMAP_TLS_REJECT_UNAUTHORIZED).toBe(
      false,
    )
    expect(() => loadConfig({ IMAP_TLS_REJECT_UNAUTHORIZED: 'nope' })).toThrowError(
      /IMAP_TLS_REJECT_UNAUTHORIZED/,
    )
  })

  it('defaults to not trusting proxy headers', () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(false)
  })

  it('accepts a hop count so a spoofed X-Forwarded-For prefix is ignored', () => {
    const trustOne = loadConfig({ TRUST_PROXY: '1' }).TRUST_PROXY
    expect(typeof trustOne).toBe('function')
    const trust = trustOne as (address: string, hop: number) => boolean
    // hop 0 is the socket (Traefik); everything further left is untrusted.
    expect(trust('172.22.1.200', 0)).toBe(true)
    expect(trust('203.0.113.9', 1)).toBe(false)

    expect(loadConfig({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true)
    expect(() => loadConfig({ TRUST_PROXY: 'eleven' })).toThrowError(/TRUST_PROXY/)
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

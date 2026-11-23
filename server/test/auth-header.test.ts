import { describe, expect, it } from 'vitest'
import { parseBasicAuthorization } from '../src/http/auth.js'

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64')

describe('parseBasicAuthorization', () => {
  it('decodes a mailbox and password, keeping colons in the password', () => {
    const header = `Basic ${encode('user@example.org:p:a:ss')}`

    expect(parseBasicAuthorization(header)).toEqual({
      mailbox: 'user@example.org',
      password: 'p:a:ss',
    })
  })

  it('is case-insensitive about the scheme', () => {
    expect(parseBasicAuthorization(`basic ${encode('a@b.c:x')}`).mailbox).toBe('a@b.c')
  })

  it.each([
    ['missing header', undefined],
    ['empty header', ''],
    ['no scheme', encode('a@b.c:x')],
    ['wrong scheme', `Bearer ${encode('a@b.c:x')}`],
    ['no colon', `Basic ${encode('a@b.c')}`],
    ['empty mail box', `Basic ${encode(':x')}`],
    ['empty password', `Basic ${encode('a@b.c:')}`],
  ])('rejects %s', (_label, header) => {
    expect(() => parseBasicAuthorization(header)).toThrowError(/credentials are required/)
  })
})

import { describe, expect, it } from 'vitest'
import { createDeviceKey, openSecret, sealSecret } from './credential-crypto'

function bytes(value: ArrayBuffer | Uint8Array): Buffer {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value))
}

describe('credential sealing', () => {
  it('creates a non-extractable key', async () => {
    const key = await createDeviceKey()

    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('round-trips a password, including non-ASCII', async () => {
    const key = await createDeviceKey()
    const sealed = await sealSecret(key, 'p@ss wörd-\u00e4')

    await expect(openSecret(key, sealed)).resolves.toBe('p@ss wörd-\u00e4')
  })

  it('uses a fresh IV for every record', async () => {
    const key = await createDeviceKey()
    const first = await sealSecret(key, 'same password')
    const second = await sealSecret(key, 'same password')

    expect(bytes(first.iv).equals(bytes(second.iv))).toBe(false)
    expect(bytes(first.ciphertext).equals(bytes(second.ciphertext))).toBe(false)
  })

  it('cannot be opened with another device key', async () => {
    const key = await createDeviceKey()
    const other = await createDeviceKey()
    const sealed = await sealSecret(key, 'secret')

    await expect(openSecret(other, sealed)).rejects.toThrow()
  })

  it('rejects a tampered ciphertext', async () => {
    const key = await createDeviceKey()
    const sealed = await sealSecret(key, 'secret')
    const tampered = new Uint8Array(sealed.ciphertext)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff

    await expect(
      openSecret(key, { iv: sealed.iv, ciphertext: tampered.buffer }),
    ).rejects.toThrow()
  })
})

/**
 * Sealing for at-rest storage on the device.
 *
 * The AES key is generated non-extractable: it can encrypt and decrypt, but its
 * raw bytes cannot be read back by JavaScript, so a script that gets to run here
 * can use the key but cannot exfiltrate it. It lives in IndexedDB alongside the
 * ciphertext, which means losing the browser profile loses the password — by
 * design, there is no recovery path and no server copy.
 */
export interface SealedSecret {
  iv: Uint8Array
  ciphertext: ArrayBuffer
}

const KEY_ALGORITHM: AesKeyGenParams = { name: 'AES-GCM', length: 256 }
const IV_BYTES = 12

export async function createDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(KEY_ALGORITHM, false, ['encrypt', 'decrypt'])
}

export async function sealSecret(key: CryptoKey, plaintext: string): Promise<SealedSecret> {
  const iv = new Uint8Array(IV_BYTES)
  crypto.getRandomValues(iv)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { iv, ciphertext }
}

export async function openSecret(key: CryptoKey, sealed: SealedSecret): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    // Copy into a fresh view: values read back from IndexedDB are typed over
    // ArrayBufferLike, which the DOM types do not accept as a BufferSource.
    { name: 'AES-GCM', iv: new Uint8Array(sealed.iv) },
    key,
    sealed.ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}

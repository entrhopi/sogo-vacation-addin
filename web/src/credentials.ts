/**
 * Device-only credential storage.
 *
 * Both the non-extractable key and the sealed passwords live in IndexedDB, so
 * the password never leaves this browser profile: not to the middleware, not to
 * a sync service, not to another device. Clearing site data or using another
 * browser simply means typing the password again.
 */
import {
  createDeviceKey,
  openSecret,
  sealSecret,
  type SealedSecret,
} from './credential-crypto'

const DATABASE = 'sogo-ooo'
const VERSION = 1
const KEY_STORE = 'keys'
const ACCOUNT_STORE = 'accounts'
const DEVICE_KEY_ID = 'device'

export interface StoredAccount {
  mailbox: string
  updatedAt: number
}

interface AccountRecord {
  mailbox: string
  updatedAt: number
  iv: Uint8Array
  ciphertext: ArrayBuffer
}

export function storageAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE)
      }
      if (!db.objectStoreNames.contains(ACCOUNT_STORE)) {
        db.createObjectStore(ACCOUNT_STORE, { keyPath: 'mailbox' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Cannot open the credential store'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Storage request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Storage transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted'))
  })
}

async function loadDeviceKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const transaction = db.transaction(KEY_STORE, 'readonly')
  const key = await requestToPromise(transaction.objectStore(KEY_STORE).get(DEVICE_KEY_ID))
  return key ? (key as CryptoKey) : null
}

async function ensureDeviceKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await loadDeviceKey(db)
  if (existing) {
    return existing
  }
  const key = await createDeviceKey()
  const transaction = db.transaction(KEY_STORE, 'readwrite')
  transaction.objectStore(KEY_STORE).put(key, DEVICE_KEY_ID)
  await transactionDone(transaction)
  return key
}

export async function listAccounts(): Promise<StoredAccount[]> {
  if (!storageAvailable()) {
    return []
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction(ACCOUNT_STORE, 'readonly')
    const records = (await requestToPromise(
      transaction.objectStore(ACCOUNT_STORE).getAll(),
    )) as AccountRecord[]
    return records
      .map((record) => ({ mailbox: record.mailbox, updatedAt: record.updatedAt }))
      .sort((left, right) => left.mailbox.localeCompare(right.mailbox))
  } finally {
    db.close()
  }
}

export async function savePassword(mailbox: string, password: string): Promise<void> {
  const db = await openDatabase()
  try {
    const key = await ensureDeviceKey(db)
    const sealed: SealedSecret = await sealSecret(key, password)
    const record: AccountRecord = {
      mailbox,
      updatedAt: Date.now(),
      iv: sealed.iv,
      ciphertext: sealed.ciphertext,
    }
    const transaction = db.transaction(ACCOUNT_STORE, 'readwrite')
    transaction.objectStore(ACCOUNT_STORE).put(record)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

/**
 * Returns null when nothing is stored, or when the record cannot be decrypted
 * (for example the key was cleared but the record survived). The caller should
 * treat a null as "ask for the password" and may drop the stale record.
 */
export async function readPassword(mailbox: string): Promise<string | null> {
  if (!storageAvailable()) {
    return null
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction(ACCOUNT_STORE, 'readonly')
    const record = (await requestToPromise(
      transaction.objectStore(ACCOUNT_STORE).get(mailbox),
    )) as AccountRecord | undefined
    if (!record) {
      return null
    }
    const key = await loadDeviceKey(db)
    if (!key) {
      return null
    }
    return await openSecret(key, { iv: record.iv, ciphertext: record.ciphertext })
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function forgetPassword(mailbox: string): Promise<void> {
  if (!storageAvailable()) {
    return
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction(ACCOUNT_STORE, 'readwrite')
    transaction.objectStore(ACCOUNT_STORE).delete(mailbox)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function forgetEverything(): Promise<void> {
  if (!storageAvailable()) {
    return
  }
  const db = await openDatabase()
  try {
    const transaction = db.transaction([KEY_STORE, ACCOUNT_STORE], 'readwrite')
    transaction.objectStore(ACCOUNT_STORE).clear()
    transaction.objectStore(KEY_STORE).clear()
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

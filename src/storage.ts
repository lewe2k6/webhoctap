import type { Catalog, Pack, SavedAttempt } from './types'

export interface SavedCatalog {
  catalog: Catalog
  available: string[]
}

interface Entry<T> {
  key: string
  value: T
}

let database: Promise<IDBDatabase> | undefined

function openDatabase() {
  if (database) return database
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('webhoctap-offline-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('data', { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Không mở được bộ nhớ ngoại tuyến.'))
  })
  return database
}

async function read<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('data').objectStore('data').get(key)
    request.onsuccess = () => resolve((request.result as Entry<T> | undefined)?.value)
    request.onerror = () => reject(request.error)
  })
}

async function write<T>(key: string, value: T) {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('data', 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Không ghi được dữ liệu ngoại tuyến.'))
    transaction.objectStore('data').put({ key, value })
  })
}

async function scan<T>(prefix: string): Promise<Entry<T>[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
    const request = db.transaction('data').objectStore('data').getAll(range)
    request.onsuccess = () => resolve(request.result as Entry<T>[])
    request.onerror = () => reject(request.error)
  })
}

const userPrefix = (userId: string) => userId + '/'

export const localData = {
  getCatalog: (userId: string) => read<SavedCatalog>(userPrefix(userId) + 'catalog'),
  setCatalog: (userId: string, data: SavedCatalog) => write(userPrefix(userId) + 'catalog', data),
  getPack: (userId: string, courseId: string) => read<Pack>(userPrefix(userId) + 'pack/' + courseId),
  setPack: (userId: string, pack: Pack) => write(userPrefix(userId) + 'pack/' + pack.courseId, pack),
  listPacks: (userId: string) => scan<Pack>(userPrefix(userId) + 'pack/'),
  listAttempts: (userId: string) => scan<SavedAttempt>(userPrefix(userId) + 'attempt/'),
  saveAttempt: (userId: string, attempt: SavedAttempt) => write(userPrefix(userId) + 'attempt/' + attempt.id, attempt),
  async clear(userId: string) {
    const db = await openDatabase()
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('data', 'readwrite')
      const prefix = userPrefix(userId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore('data').delete(IDBKeyRange.bound(prefix, prefix + '\uffff'))
    })
  },
}

export function getTrustedOwner() {
  try { return localStorage.getItem('webhoctap-owner') } catch { return null }
}

export function setTrustedOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem('webhoctap-owner', userId)
    else localStorage.removeItem('webhoctap-owner')
  } catch {
    // Browsers configured without local storage can still use an online session.
  }
}

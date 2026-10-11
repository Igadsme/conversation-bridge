// PERSONAL CALIBRATION 5 - Keep recordings and the trained model in this browser.
//
// IndexedDB, not localStorage: a few hundred clips are tens of MB, more than
// localStorage holds. Everything stays on this device. Site data can still be
// cleared, so the Record page keeps "Download backup" and "Import files".
//
//   clips: one PersonalClip per key (sign + time), plus its ASL Citizen
//          features once training has computed them (so they're computed once)
//   model: the personal model trained in this browser (same shape as
//          personal_model.json)

import type { SavedModel } from './personalmodel'
import { clipKey, type PersonalClip } from './signs'

export type StoredClip = PersonalClip & { features?: number[] }

const DB_NAME = 'sora-personal'
const CLIPS = 'clips'
const MODEL = 'model'
const MODEL_KEY = 'current'

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') throw new Error('This browser cannot store recordings')
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CLIPS)
      request.result.createObjectStore(MODEL)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((err) => {
    opening = null // allow a retry after a failure
    throw err
  })
  return opening
}

// Run one transaction; resolves with the request's result once it's committed
async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = work(tx.objectStore(store))
    tx.oncomplete = () => resolve(request?.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const loadClips = () => run<StoredClip[]>(CLIPS, 'readonly', (s) => s.getAll())

export const saveClips = (clips: StoredClip[]) =>
  run<void>(CLIPS, 'readwrite', (s) => {
    for (const c of clips) s.put(c, clipKey(c))
  })

export const deleteClip = (clip: PersonalClip) => run<void>(CLIPS, 'readwrite', (s) => s.delete(clipKey(clip)))

export const loadModel = () => run<SavedModel | undefined>(MODEL, 'readonly', (s) => s.get(MODEL_KEY))

export const saveModel = (model: SavedModel) => run<void>(MODEL, 'readwrite', (s) => s.put(model, MODEL_KEY))

// Forget everything: every recording and the model trained on them
export async function deleteEverything() {
  await run<void>(CLIPS, 'readwrite', (s) => s.clear())
  await run<void>(MODEL, 'readwrite', (s) => s.clear())
}

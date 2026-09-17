import { getDatabase } from '../../database/database'
import { STORE_NAMES } from '../../database/schema'
import { generateId } from '../../utils/id'
import type { DocumentStorageResult, DocumentStorageService } from './DocumentStorageService'

/** Local, offline-first implementation backed by the `documentFiles`
 * IndexedDB object store. This is the default/only storage backend in V1;
 * swapping in a cloud-backed service later only requires a new class that
 * implements `DocumentStorageService`. */
export class IndexedDbDocumentStorageService implements DocumentStorageService {
  async save(file: File): Promise<DocumentStorageResult> {
    const db = await getDatabase()
    const storageKey = generateId()
    await db.put(STORE_NAMES.documentFiles, { id: storageKey, blob: file })
    return { storageKey, filename: file.name, mimeType: file.type, size: file.size }
  }

  async get(storageKey: string): Promise<Blob | undefined> {
    const db = await getDatabase()
    const record = await db.get(STORE_NAMES.documentFiles, storageKey)
    return record?.blob
  }

  async delete(storageKey: string): Promise<void> {
    const db = await getDatabase()
    await db.delete(STORE_NAMES.documentFiles, storageKey)
  }
}

export const documentStorageService: DocumentStorageService = new IndexedDbDocumentStorageService()

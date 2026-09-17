import { DEFAULT_USER_ID } from '../../constants/user'
import { ACCEPTED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '../../constants/files'
import { documentStorageService } from '../../services/storage/IndexedDbDocumentStorageService'
import { generateId } from '../../utils/id'
import type { Document, DocumentType } from '../models/entities'
import {
  billRepository,
  contractRepository,
  documentRepository,
  wasteCostRepository,
} from '../repositories/indexedDbRepositories'

/** Validates a user-selected file before anything is read or stored.
 * Centralized so the import UI and any future document upload entry point
 * (e.g. attaching a document to a contract) share the same rules. */
export function validateDocumentFile(file: File): string[] {
  const errors: string[] = []
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    errors.push(`Die Datei ist zu groß (max. ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)} MB).`)
  }
  if (!ACCEPTED_DOCUMENT_MIME_TYPES.includes(file.type as (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number])) {
    errors.push('Dieser Dateityp wird nicht unterstützt. Bitte PDF, JPEG, PNG oder WebP verwenden.')
  }
  return errors
}

/** SHA-256 checksum (hex) of a file's bytes via the browser's built-in Web
 * Crypto API - no extra dependency. Lets a later "did the bytes actually
 * change" check (e.g. after replacing a file) be exact rather than
 * guessed from size/mimeType alone. */
export async function calculateChecksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Persists a validated file's bytes via DocumentStorageService and records
 * its metadata as a Document entity. Throws with a user-presentable German
 * message on failure rather than letting a raw storage error surface. */
export async function saveDocumentFile(file: File, type: DocumentType): Promise<Document> {
  const errors = validateDocumentFile(file)
  if (errors.length > 0) throw new Error(errors.join(' '))

  let storageResult
  try {
    storageResult = await documentStorageService.save(file)
  } catch {
    throw new Error('Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.')
  }
  const checksum = await calculateChecksum(file)

  const now = new Date().toISOString()
  const document: Document = {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    userId: DEFAULT_USER_ID,
    type,
    filename: storageResult.filename,
    mimeType: storageResult.mimeType,
    size: storageResult.size,
    storagePath: storageResult.storageKey,
    ocrStatus: 'not_started',
    checksum,
  }
  return documentRepository.save(document)
}

/** Replaces a document's bytes in place ("Datei ersetzen"): saves the new
 * file under a fresh storage key, updates the Document's metadata
 * (filename/mimeType/size/checksum) to match, resets its OCR state since
 * the previous recognition no longer applies to the new content, and only
 * then removes the old blob - so a failure partway through never leaves the
 * document without any readable file. */
export async function replaceDocumentFile(documentId: string, file: File): Promise<Document> {
  const errors = validateDocumentFile(file)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await documentRepository.getById(documentId)
  if (!existing) throw new Error('Dokument wurde nicht gefunden.')

  let storageResult
  try {
    storageResult = await documentStorageService.save(file)
  } catch {
    throw new Error('Die Datei konnte nicht ersetzt werden. Bitte versuche es erneut.')
  }
  const checksum = await calculateChecksum(file)

  const updated = await documentRepository.save({
    ...existing,
    filename: storageResult.filename,
    mimeType: storageResult.mimeType,
    size: storageResult.size,
    storagePath: storageResult.storageKey,
    checksum,
    ocrStatus: 'not_started',
    ocrText: undefined,
  })

  await documentStorageService.delete(existing.storagePath).catch(() => undefined)
  return updated
}

export async function getDocument(documentId: string): Promise<Document | undefined> {
  return documentRepository.getById(documentId)
}

export async function getDocumentBlob(document: Document): Promise<Blob | undefined> {
  return documentStorageService.get(document.storagePath)
}

/** Deletes a document's stored bytes and its metadata entity. Callers that
 * reference a document (e.g. a Bill) are responsible for clearing their own
 * `documentId` - deleting a document must never cascade-delete the record
 * it was attached to. */
export async function deleteDocument(documentId: string): Promise<void> {
  const document = await documentRepository.getById(documentId)
  if (!document) return
  await documentStorageService.delete(document.storagePath)
  await documentRepository.delete(documentId)
}

export type DocumentLinkedEntityType = 'bill' | 'contract' | 'waste'

export interface DocumentLinkedEntity {
  entityType: DocumentLinkedEntityType
  entityId: string
  /** Short, human-readable label for the referencing record (e.g. a bill's
   * year or a contract's provider) - not routing information, so this
   * module stays independent of the UI's route constants. */
  label: string
}

/** Finds the single Bill/Contract/WasteCost that currently references a
 * document via its `documentId`, if any. A document is only ever attached
 * to one entity at a time in V1 (there is no many-to-many DocumentLink), so
 * the first match wins. */
async function findLinkedEntity(documentId: string): Promise<DocumentLinkedEntity | undefined> {
  const [bills, contracts, wasteCosts] = await Promise.all([
    billRepository.getAll(),
    contractRepository.getAll(),
    wasteCostRepository.getAll(),
  ])

  const bill = bills.find((entry) => entry.documentId === documentId)
  if (bill) return { entityType: 'bill', entityId: bill.id, label: `Abrechnung ${bill.year}` }

  const contract = contracts.find((entry) => entry.documentId === documentId)
  if (contract) return { entityType: 'contract', entityId: contract.id, label: contract.provider }

  const wasteCost = wasteCosts.find((entry) => entry.documentId === documentId)
  if (wasteCost) return { entityType: 'waste', entityId: wasteCost.id, label: `Müllkosten ${wasteCost.year}` }

  return undefined
}

export async function getLinkedEntity(documentId: string): Promise<DocumentLinkedEntity | undefined> {
  return findLinkedEntity(documentId)
}

export async function isDocumentReferenced(documentId: string): Promise<boolean> {
  return (await findLinkedEntity(documentId)) !== undefined
}

/** Deletes a document only if no Bill/Contract/WasteCost still references
 * it - used when the *referencing* entity itself is deleted, so a document
 * another (still-live) entity might reference is never orphaned or
 * accidentally removed out from under it. Call this after the referencing
 * entity has already been (soft-)deleted, so it no longer counts as a
 * reference. */
export async function deleteDocumentIfUnreferenced(documentId: string | undefined): Promise<void> {
  if (!documentId) return
  if (await isDocumentReferenced(documentId)) return
  await deleteDocument(documentId)
}

/** Deletes a document unconditionally (used from the central Document
 * Management screen, where deleting a document is an explicit, direct
 * user action) and clears the `documentId` link - and, for a Bill, resets
 * its OCR status - on whatever entity still referenced it, so deleting a
 * document from /dokumente never leaves a dangling reference behind. */
export async function deleteDocumentAndClearReferences(documentId: string): Promise<void> {
  const linkedEntity = await findLinkedEntity(documentId)
  if (linkedEntity) {
    if (linkedEntity.entityType === 'bill') {
      const bill = await billRepository.getById(linkedEntity.entityId)
      if (bill) await billRepository.save({ ...bill, documentId: undefined, ocrStatus: 'not_started' })
    } else if (linkedEntity.entityType === 'contract') {
      const contract = await contractRepository.getById(linkedEntity.entityId)
      if (contract) await contractRepository.save({ ...contract, documentId: undefined })
    } else {
      const wasteCost = await wasteCostRepository.getById(linkedEntity.entityId)
      if (wasteCost) await wasteCostRepository.save({ ...wasteCost, documentId: undefined })
    }
  }
  await deleteDocument(documentId)
}

export interface DocumentOverviewEntry {
  document: Document
  linkedEntity?: DocumentLinkedEntity
}

/** Loads every document's metadata (never its bytes - see
 * getDocumentBlob for that) together with what it's linked to, once, for
 * the /dokumente overview screen. Sorted newest first; the feature layer
 * applies search/filter/sort on top of this already-loaded list instead of
 * re-querying IndexedDB per interaction. */
export async function listDocumentsOverview(): Promise<DocumentOverviewEntry[]> {
  const documents = await documentRepository.getAll()
  const entries = await Promise.all(
    documents.map(async (document) => ({ document, linkedEntity: await findLinkedEntity(document.id) })),
  )
  return entries.sort(
    (a, b) => new Date(b.document.createdAt).getTime() - new Date(a.document.createdAt).getTime(),
  )
}

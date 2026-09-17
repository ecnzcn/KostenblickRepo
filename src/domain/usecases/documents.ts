import { DEFAULT_USER_ID } from '../../constants/user'
import { ACCEPTED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '../../constants/files'
import { documentStorageService } from '../../services/storage/IndexedDbDocumentStorageService'
import { generateId } from '../../utils/id'
import type { Bill, Contract, Document, DocumentType, WasteCost } from '../models/entities'
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
 * message on failure rather than letting a raw storage error surface.
 * Once the blob is saved, everything after it (checksum, Document write)
 * runs in a second try/catch that rolls the blob back on any failure - a
 * checksum error or a failed Document write must never leave an orphaned
 * blob with no metadata record pointing to it. The rollback is
 * best-effort (its own failure is swallowed) so it never masks the
 * original error the caller needs to see. */
export async function saveDocumentFile(file: File, type: DocumentType): Promise<Document> {
  const errors = validateDocumentFile(file)
  if (errors.length > 0) throw new Error(errors.join(' '))

  let storageResult
  try {
    storageResult = await documentStorageService.save(file)
  } catch {
    throw new Error('Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.')
  }

  try {
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
    return await documentRepository.save(document)
  } catch (error) {
    await documentStorageService.delete(storageResult.storageKey).catch(() => undefined)
    throw error
  }
}

/** Replaces a document's bytes in place ("Datei ersetzen"): saves the new
 * file under a fresh storage key, updates the Document's metadata
 * (filename/mimeType/size/checksum) to match, and resets its OCR state
 * since the previous recognition no longer applies to the new content.
 * Mirrors saveDocumentFile()'s robustness: once the new blob is saved,
 * everything after it (checksum, Document write) runs in a second
 * try/catch that rolls the *new* blob back on any failure, leaving the
 * existing Document untouched and still pointing at the old (still
 * present) blob - a failure partway through never leaves the document
 * without a readable file, and never deletes the old blob before the new
 * Document record has actually been saved. The rollback is best-effort
 * (its own failure is swallowed) so it never masks the original error. */
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

  let updated: Document
  try {
    const checksum = await calculateChecksum(file)
    updated = await documentRepository.save({
      ...existing,
      filename: storageResult.filename,
      mimeType: storageResult.mimeType,
      size: storageResult.size,
      storagePath: storageResult.storageKey,
      checksum,
      ocrStatus: 'not_started',
      ocrText: undefined,
    })
  } catch (error) {
    await documentStorageService.delete(storageResult.storageKey).catch(() => undefined)
    throw error
  }

  // Only removed now that the new Document record has been saved
  // successfully - the old blob stays intact for every failure above.
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

/** Builds a documentId -> linkedEntity lookup from already-loaded
 * Bill/Contract/WasteCost lists in a single O(B+C+W) pass, preserving the
 * original priority (Bill, then Contract, then WasteCost) for the rare
 * case a documentId were ever set on more than one record - the first
 * write for a given key wins, matching the previous sequential-find order. */
function buildLinkedEntityIndex(
  bills: Bill[],
  contracts: Contract[],
  wasteCosts: WasteCost[],
): Map<string, DocumentLinkedEntity> {
  const index = new Map<string, DocumentLinkedEntity>()
  for (const bill of bills) {
    if (bill.documentId && !index.has(bill.documentId)) {
      index.set(bill.documentId, { entityType: 'bill', entityId: bill.id, label: `Abrechnung ${bill.year}` })
    }
  }
  for (const contract of contracts) {
    if (contract.documentId && !index.has(contract.documentId)) {
      index.set(contract.documentId, { entityType: 'contract', entityId: contract.id, label: contract.provider })
    }
  }
  for (const wasteCost of wasteCosts) {
    if (wasteCost.documentId && !index.has(wasteCost.documentId)) {
      index.set(wasteCost.documentId, {
        entityType: 'waste',
        entityId: wasteCost.id,
        label: `Müllkosten ${wasteCost.year}`,
      })
    }
  }
  return index
}

/** Finds the single Bill/Contract/WasteCost that currently references a
 * document via its `documentId`, if any. A document is only ever attached
 * to one entity at a time in V1 (there is no many-to-many DocumentLink). */
async function findLinkedEntity(documentId: string): Promise<DocumentLinkedEntity | undefined> {
  const [bills, contracts, wasteCosts] = await Promise.all([
    billRepository.getAll(),
    contractRepository.getAll(),
    wasteCostRepository.getAll(),
  ])
  return buildLinkedEntityIndex(bills, contracts, wasteCosts).get(documentId)
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
 * getDocumentBlob for that) together with what it's linked to, for the
 * /dokumente overview screen. Documents, Bills, Contracts and WasteCosts
 * are each loaded exactly once (O(D+B+C+W) total) rather than once per
 * document - a per-document reference lookup would have meant up to 3
 * extra getAll() calls per row. Sorted newest first; the feature layer
 * applies search/filter/sort on top of this already-loaded list instead of
 * re-querying IndexedDB per interaction. */
export async function listDocumentsOverview(): Promise<DocumentOverviewEntry[]> {
  const [documents, bills, contracts, wasteCosts] = await Promise.all([
    documentRepository.getAll(),
    billRepository.getAll(),
    contractRepository.getAll(),
    wasteCostRepository.getAll(),
  ])
  const linkedEntityIndex = buildLinkedEntityIndex(bills, contracts, wasteCosts)
  const entries = documents.map((document) => ({
    document,
    linkedEntity: linkedEntityIndex.get(document.id),
  }))
  return entries.sort(
    (a, b) => new Date(b.document.createdAt).getTime() - new Date(a.document.createdAt).getTime(),
  )
}

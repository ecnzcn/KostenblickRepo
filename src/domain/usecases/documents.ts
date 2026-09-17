import { DEFAULT_USER_ID } from '../../constants/user'
import { ACCEPTED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from '../../constants/files'
import { documentStorageService } from '../../services/storage/IndexedDbDocumentStorageService'
import { generateId } from '../../utils/id'
import type { Document, DocumentType } from '../models/entities'
import { documentRepository } from '../repositories/indexedDbRepositories'

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
  }
  return documentRepository.save(document)
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

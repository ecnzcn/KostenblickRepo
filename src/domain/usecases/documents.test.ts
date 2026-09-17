// See documentStorage.test.ts for why this runs under Node rather than
// jsdom (jsdom's File/Blob aren't preserved by fake-indexeddb's
// structuredClone-based store emulation).
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../../database/database'
import { MAX_DOCUMENT_SIZE_BYTES } from '../../constants/files'
import { deleteDocument, getDocument, getDocumentBlob, saveDocumentFile, validateDocumentFile } from './documents'

beforeEach(async () => {
  await deleteDatabase()
})

function makeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('validateDocumentFile', () => {
  it('accepts a PDF within the size limit', () => {
    expect(validateDocumentFile(makeFile('bill.pdf', 'application/pdf'))).toHaveLength(0)
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s images', (mimeType) => {
    expect(validateDocumentFile(makeFile('photo', mimeType))).toHaveLength(0)
  })

  it('rejects an unsupported file type', () => {
    const errors = validateDocumentFile(makeFile('bill.docx', 'application/msword'))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a file larger than the maximum size', () => {
    const oversized = makeFile('huge.pdf', 'application/pdf', MAX_DOCUMENT_SIZE_BYTES + 1)
    const errors = validateDocumentFile(oversized)
    expect(errors.some((error) => error.includes('zu groß'))).toBe(true)
  })
})

describe('saveDocumentFile / getDocument / getDocumentBlob / deleteDocument', () => {
  it('persists a Document entity and its bytes, retrievable afterwards', async () => {
    const file = new File(['%PDF-1.4 content'], 'nebenkosten.pdf', { type: 'application/pdf' })

    const document = await saveDocumentFile(file, 'bill')

    expect(document.id).toBeTruthy()
    expect(document.filename).toBe('nebenkosten.pdf')
    expect(document.type).toBe('bill')
    expect(document.ocrStatus).toBe('not_started')

    const reloaded = await getDocument(document.id)
    expect(reloaded).toEqual(document)

    const blob = await getDocumentBlob(document)
    expect(await blob?.text()).toBe('%PDF-1.4 content')
  })

  it('throws a user-presentable error instead of saving an invalid file', async () => {
    const invalid = new File(['x'], 'note.txt', { type: 'text/plain' })
    await expect(saveDocumentFile(invalid, 'bill')).rejects.toThrow(/Dateityp/)
  })

  it('deletes both the stored bytes and (soft-)deletes the Document entity', async () => {
    const file = new File(['content'], 'doc.png', { type: 'image/png' })
    const document = await saveDocumentFile(file, 'bill')

    await deleteDocument(document.id)

    const reloaded = await getDocument(document.id)
    expect(reloaded?.deletedAt).not.toBeNull()
    expect(await getDocumentBlob(document)).toBeUndefined()
  })
})

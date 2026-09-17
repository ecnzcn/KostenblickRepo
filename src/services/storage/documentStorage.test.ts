// Runs under the Node environment rather than jsdom: jsdom's File/Blob are
// not recognized by the global structuredClone() that fake-indexeddb uses
// to emulate IndexedDB's clone-on-store semantics, which would silently
// turn every stored Blob into an empty object. Node's native File/Blob
// round-trip correctly, matching how a real browser's IndexedDB behaves.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../../database/database'
import { IndexedDbDocumentStorageService } from './IndexedDbDocumentStorageService'

beforeEach(async () => {
  await deleteDatabase()
})

describe('IndexedDbDocumentStorageService', () => {
  it('saves a file and returns its storage metadata', async () => {
    const service = new IndexedDbDocumentStorageService()
    const file = new File(['%PDF-1.4 fake content'], 'abrechnung.pdf', { type: 'application/pdf' })

    const result = await service.save(file)

    expect(result.storageKey).toBeTruthy()
    expect(result.filename).toBe('abrechnung.pdf')
    expect(result.mimeType).toBe('application/pdf')
    expect(result.size).toBe(file.size)
  })

  it('retrieves the exact bytes that were saved', async () => {
    const service = new IndexedDbDocumentStorageService()
    const file = new File(['hello document'], 'photo.jpg', { type: 'image/jpeg' })

    const { storageKey } = await service.save(file)
    const blob = await service.get(storageKey)

    expect(blob).toBeDefined()
    expect(await blob?.text()).toBe('hello document')
  })

  it('returns undefined for an unknown storage key', async () => {
    const service = new IndexedDbDocumentStorageService()
    expect(await service.get('does-not-exist')).toBeUndefined()
  })

  it('deletes a stored file so it can no longer be retrieved', async () => {
    const service = new IndexedDbDocumentStorageService()
    const file = new File(['content'], 'doc.png', { type: 'image/png' })

    const { storageKey } = await service.save(file)
    await service.delete(storageKey)

    expect(await service.get(storageKey)).toBeUndefined()
  })
})

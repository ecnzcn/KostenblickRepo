// Runs under the Node environment (not jsdom) for the same reason as
// documents.test.ts/documentStorage.test.ts: jsdom's File/Blob are not
// preserved by fake-indexeddb's structuredClone-based store emulation, so
// reading bytes back would silently see empty objects instead.
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  billRepository,
  contractRepository,
  documentRepository,
  wasteCostRepository,
} from '../domain/repositories/indexedDbRepositories'
import { documentStorageService } from '../services/storage/IndexedDbDocumentStorageService'
import { createBillWithItems, deleteBillWithItems, getBill, type BillInput } from '../domain/usecases/bills'
import {
  createContract,
  deleteContract,
  removeContractDocument,
  setContractDocument,
  updateContract,
  type ContractInput,
} from '../domain/usecases/contracts'
import {
  calculateChecksum,
  deleteDocumentAndClearReferences,
  deleteDocumentIfUnreferenced,
  getDocument,
  getDocumentBlob,
  getLinkedEntity,
  isDocumentReferenced,
  listDocumentsOverview,
  replaceDocumentFile,
  saveDocumentFile,
} from '../domain/usecases/documents'
import {
  createWasteCost,
  deleteWasteCost,
  getWasteCost,
  updateWasteCost,
  type WasteCostInput,
} from '../domain/usecases/wasteCosts'

beforeEach(async () => {
  await deleteDatabase()
})

function makeFile(name: string, type: string, content = 'content'): File {
  return new File([content], name, { type })
}

const baseContractInput = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  categoryId: 'electricity',
  provider: 'EnBW',
  monthlyCost: 60,
  startDate: '2025-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: false,
  ...overrides,
})

const baseWasteCostInput = (overrides: Partial<WasteCostInput> = {}): WasteCostInput => ({
  year: 2026,
  category: 'residual',
  amount: 92,
  ...overrides,
})

const baseBillInput = (overrides: Partial<BillInput> = {}): BillInput => ({
  type: 'annual_statement',
  year: 2025,
  advancePayments: 0,
  items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
  ...overrides,
})

describe('calculateChecksum', () => {
  it('produces a stable SHA-256 hex digest for identical content', async () => {
    const a = await calculateChecksum(makeFile('a.pdf', 'application/pdf', 'hello'))
    const b = await calculateChecksum(makeFile('b.pdf', 'application/pdf', 'hello'))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs for different content', async () => {
    const a = await calculateChecksum(makeFile('a.pdf', 'application/pdf', 'hello'))
    const b = await calculateChecksum(makeFile('b.pdf', 'application/pdf', 'world'))
    expect(a).not.toBe(b)
  })
})

describe('saveDocumentFile', () => {
  it('stores a checksum alongside the document metadata', async () => {
    const document = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')
    expect(document.checksum).toMatch(/^[0-9a-f]{64}$/)
  })

  it('success case: the blob and the Document entity both persist', async () => {
    const document = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'content'), 'bill')

    expect(await getDocument(document.id)).toBeDefined()
    expect(await documentStorageService.get(document.storagePath)).toBeDefined()
  })

  it('rolls back the saved blob if persisting the Document entity fails, and propagates the original error', async () => {
    const saveSpy = vi.spyOn(documentStorageService, 'save')
    const repoSaveSpy = vi.spyOn(documentRepository, 'save').mockRejectedValueOnce(new Error('write failed'))

    await expect(saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')).rejects.toThrow('write failed')

    const storageResult = await saveSpy.mock.results[0]!.value
    expect(await documentStorageService.get(storageResult.storageKey)).toBeUndefined()

    saveSpy.mockRestore()
    repoSaveSpy.mockRestore()
  })

  it('rolls back the saved blob if checksum calculation fails, and propagates the original error', async () => {
    const saveSpy = vi.spyOn(documentStorageService, 'save')
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('digest failed'))

    await expect(saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')).rejects.toThrow('digest failed')

    const storageResult = await saveSpy.mock.results[0]!.value
    expect(await documentStorageService.get(storageResult.storageKey)).toBeUndefined()

    saveSpy.mockRestore()
    digestSpy.mockRestore()
  })

  it('a rollback failure (blob delete also fails) never masks the original error', async () => {
    const repoSaveSpy = vi.spyOn(documentRepository, 'save').mockRejectedValueOnce(new Error('write failed'))
    const deleteSpy = vi.spyOn(documentStorageService, 'delete').mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')).rejects.toThrow('write failed')

    repoSaveSpy.mockRestore()
    deleteSpy.mockRestore()
  })
})

describe('replaceDocumentFile', () => {
  it('swaps the stored bytes, updates metadata/checksum and resets the OCR state', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'old content'), 'bill')

    const replaced = await replaceDocumentFile(original.id, makeFile('bill-v2.png', 'image/png', 'new content'))

    expect(replaced.id).toBe(original.id)
    expect(replaced.filename).toBe('bill-v2.png')
    expect(replaced.mimeType).toBe('image/png')
    expect(replaced.checksum).not.toBe(original.checksum)
    expect(replaced.ocrStatus).toBe('not_started')

    const blob = await getDocumentBlob(replaced)
    expect(await blob?.text()).toBe('new content')
  })

  it('the old blob is no longer retrievable under the previous storage path after replacing', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'old content'), 'bill')
    const oldStoragePath = original.storagePath

    await replaceDocumentFile(original.id, makeFile('bill-v2.pdf', 'application/pdf', 'new content'))

    const { documentStorageService } = await import('../services/storage/IndexedDbDocumentStorageService')
    expect(await documentStorageService.get(oldStoragePath)).toBeUndefined()
  })

  it('throws a user-presentable error for an unknown document id', async () => {
    await expect(replaceDocumentFile('missing', makeFile('x.pdf', 'application/pdf'))).rejects.toThrow(
      'nicht gefunden',
    )
  })

  it('rejects an unsupported replacement file type without touching the existing document', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')
    await expect(replaceDocumentFile(original.id, makeFile('note.txt', 'text/plain'))).rejects.toThrow(/Dateityp/)
    expect((await getDocument(original.id))?.filename).toBe('bill.pdf')
  })

  it('rolls back the new blob if checksum calculation fails, leaving the old blob and Document untouched', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'old content'), 'bill')
    const oldStoragePath = original.storagePath

    const saveSpy = vi.spyOn(documentStorageService, 'save')
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('digest failed'))

    await expect(
      replaceDocumentFile(original.id, makeFile('bill-v2.pdf', 'application/pdf', 'new content')),
    ).rejects.toThrow('digest failed')

    const newStorageResult = await saveSpy.mock.results[0]!.value
    expect(await documentStorageService.get(newStorageResult.storageKey)).toBeUndefined()
    expect(await documentStorageService.get(oldStoragePath)).toBeDefined()

    const reloaded = await getDocument(original.id)
    expect(reloaded?.storagePath).toBe(oldStoragePath)
    expect(reloaded?.filename).toBe('bill.pdf')
    expect(reloaded?.checksum).toBe(original.checksum)

    saveSpy.mockRestore()
    digestSpy.mockRestore()
  })

  it('rolls back the new blob if saving the updated Document fails, leaving the old blob and Document untouched', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'old content'), 'bill')
    const oldStoragePath = original.storagePath

    const saveSpy = vi.spyOn(documentStorageService, 'save')
    const repoSaveSpy = vi.spyOn(documentRepository, 'save').mockRejectedValueOnce(new Error('write failed'))

    await expect(
      replaceDocumentFile(original.id, makeFile('bill-v2.pdf', 'application/pdf', 'new content')),
    ).rejects.toThrow('write failed')

    const newStorageResult = await saveSpy.mock.results[0]!.value
    expect(await documentStorageService.get(newStorageResult.storageKey)).toBeUndefined()
    expect(await documentStorageService.get(oldStoragePath)).toBeDefined()

    const reloaded = await getDocument(original.id)
    expect(reloaded?.storagePath).toBe(oldStoragePath)
    expect(reloaded?.filename).toBe('bill.pdf')

    saveSpy.mockRestore()
    repoSaveSpy.mockRestore()
  })

  it('a rollback failure (new blob delete also fails) never masks the original replace error', async () => {
    const original = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf', 'old content'), 'bill')

    const repoSaveSpy = vi.spyOn(documentRepository, 'save').mockRejectedValueOnce(new Error('replace failed'))
    const deleteSpy = vi.spyOn(documentStorageService, 'delete').mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(
      replaceDocumentFile(original.id, makeFile('bill-v2.pdf', 'application/pdf', 'new content')),
    ).rejects.toThrow('replace failed')

    repoSaveSpy.mockRestore()
    deleteSpy.mockRestore()
  })
})

describe('getLinkedEntity / isDocumentReferenced', () => {
  it('finds the Bill referencing a document', async () => {
    const document = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: document.id }))

    expect(await getLinkedEntity(document.id)).toEqual({
      entityType: 'bill',
      entityId: bill.id,
      label: 'Abrechnung 2025',
    })
    expect(await isDocumentReferenced(document.id)).toBe(true)
  })

  it('finds the Contract referencing a document', async () => {
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    const contract = await createContract(baseContractInput())
    await setContractDocument(contract.id, document.id)

    expect(await getLinkedEntity(document.id)).toEqual({
      entityType: 'contract',
      entityId: contract.id,
      label: 'EnBW',
    })
  })

  it('returns undefined for an unreferenced document', async () => {
    const document = await saveDocumentFile(makeFile('lonely.pdf', 'application/pdf'), 'other')
    expect(await getLinkedEntity(document.id)).toBeUndefined()
    expect(await isDocumentReferenced(document.id)).toBe(false)
  })
})

describe('deleting the referencing entity cleans up its document', () => {
  it('deletes the linked document when a bill is deleted and nothing else references it', async () => {
    const document = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: document.id }))

    await deleteBillWithItems(bill.id)

    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
  })

  it('deletes the linked document when a contract is deleted and nothing else references it', async () => {
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    const contract = await createContract(baseContractInput())
    await setContractDocument(contract.id, document.id)

    await deleteContract(contract.id)

    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
  })

  it('is safe to call deleteContract for a contract with no document', async () => {
    const contract = await createContract(baseContractInput())
    await expect(deleteContract(contract.id)).resolves.toBeUndefined()
  })

  it('keeps the document when another live entity still references it', async () => {
    const document = await saveDocumentFile(makeFile('shared.pdf', 'application/pdf'), 'other')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: document.id }))
    // A document is only ever attached to one entity via the app's own
    // flows in V1 (no DocumentLink many-to-many) - this simulates a second
    // reference directly to prove the generic reference check would still
    // protect the document if that ever changed.
    const contract = await createContract(baseContractInput())
    await setContractDocument(contract.id, document.id)

    await deleteBillWithItems(bill.id)

    expect((await getDocument(document.id))?.deletedAt).toBeNull()
  })
})

describe('deleteDocumentIfUnreferenced', () => {
  it('is a no-op for an undefined documentId', async () => {
    await expect(deleteDocumentIfUnreferenced(undefined)).resolves.toBeUndefined()
  })
})

describe('deleteDocumentAndClearReferences', () => {
  it('deletes the document and clears + resets the referencing Bill', async () => {
    const document = await saveDocumentFile(makeFile('bill.pdf', 'application/pdf'), 'bill')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: document.id }))

    await deleteDocumentAndClearReferences(document.id)

    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
    const reloadedBill = await getBill(bill.id)
    expect(reloadedBill?.documentId).toBeUndefined()
    expect(reloadedBill?.ocrStatus).toBe('not_started')
  })

  it('deletes the document and clears the referencing Contract', async () => {
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    const contract = await createContract(baseContractInput())
    await setContractDocument(contract.id, document.id)

    await deleteDocumentAndClearReferences(document.id)

    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
    expect((await contractRepository.getById(contract.id))?.documentId).toBeUndefined()
  })

  it('is safe to call for a document with no referencing entity', async () => {
    const document = await saveDocumentFile(makeFile('lonely.pdf', 'application/pdf'), 'other')
    await deleteDocumentAndClearReferences(document.id)
    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
  })
})

describe('listDocumentsOverview', () => {
  it('lists every document, newest first, each with its linked entity (or none)', async () => {
    const older = await saveDocumentFile(makeFile('older.pdf', 'application/pdf'), 'other')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    const contract = await createContract(baseContractInput())
    await setContractDocument(contract.id, document.id)

    const overview = await listDocumentsOverview()

    expect(overview.map((entry) => entry.document.id)).toEqual([document.id, older.id])
    expect(overview[0]?.linkedEntity).toEqual({ entityType: 'contract', entityId: contract.id, label: 'EnBW' })
    expect(overview[1]?.linkedEntity).toBeUndefined()
  })

  it('returns an empty list without crashing when there are no documents', async () => {
    expect(await listDocumentsOverview()).toEqual([])
  })

  it('loads each repository exactly once, regardless of how many documents exist (no per-document getAll())', async () => {
    const linkedDocument = await saveDocumentFile(makeFile('linked.pdf', 'application/pdf'), 'bill')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: linkedDocument.id }))
    await saveDocumentFile(makeFile('unlinked-1.pdf', 'application/pdf'), 'other')
    await saveDocumentFile(makeFile('unlinked-2.pdf', 'application/pdf'), 'other')

    const documentGetAllSpy = vi.spyOn(documentRepository, 'getAll')
    const billGetAllSpy = vi.spyOn(billRepository, 'getAll')
    const contractGetAllSpy = vi.spyOn(contractRepository, 'getAll')
    const wasteGetAllSpy = vi.spyOn(wasteCostRepository, 'getAll')

    const overview = await listDocumentsOverview()

    expect(overview).toHaveLength(3)
    expect(documentGetAllSpy).toHaveBeenCalledTimes(1)
    expect(billGetAllSpy).toHaveBeenCalledTimes(1)
    expect(contractGetAllSpy).toHaveBeenCalledTimes(1)
    expect(wasteGetAllSpy).toHaveBeenCalledTimes(1)

    // Result stays fachlich identical to a per-document lookup: the linked
    // document still resolves to the correct Bill, unlinked ones to none.
    const linkedEntry = overview.find((entry) => entry.document.id === linkedDocument.id)
    expect(linkedEntry?.linkedEntity).toEqual({ entityType: 'bill', entityId: bill.id, label: 'Abrechnung 2025' })
    expect(overview.filter((entry) => entry.linkedEntity === undefined)).toHaveLength(2)

    documentGetAllSpy.mockRestore()
    billGetAllSpy.mockRestore()
    contractGetAllSpy.mockRestore()
    wasteGetAllSpy.mockRestore()
  })
})

describe('setContractDocument / removeContractDocument', () => {
  it('attaches a document without affecting the contract\'s other fields', async () => {
    const contract = await createContract(baseContractInput())
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')

    const updated = await setContractDocument(contract.id, document.id)

    expect(updated.documentId).toBe(document.id)
    expect(updated.provider).toBe(contract.provider)
    expect(updated.monthlyCost).toBe(contract.monthlyCost)
  })

  it('throws for an unknown contract id', async () => {
    await expect(setContractDocument('missing', 'doc-1')).rejects.toThrow('nicht gefunden')
  })

  it('throws for an unknown document id, even when the contract exists', async () => {
    const contract = await createContract(baseContractInput())
    await expect(setContractDocument(contract.id, 'missing-document')).rejects.toThrow('nicht gefunden')
    expect((await contractRepository.getById(contract.id))?.documentId).toBeUndefined()
  })

  it('re-attaching a different document cleans up the previous one once it is no longer referenced', async () => {
    const contract = await createContract(baseContractInput())
    const documentA = await saveDocumentFile(makeFile('a.pdf', 'application/pdf'), 'contract')
    const documentB = await saveDocumentFile(makeFile('b.pdf', 'application/pdf'), 'contract')

    await setContractDocument(contract.id, documentA.id)
    const updated = await setContractDocument(contract.id, documentB.id)

    expect(updated.documentId).toBe(documentB.id)
    expect((await getDocument(documentA.id))?.deletedAt).not.toBeNull()
    expect((await getDocument(documentB.id))?.deletedAt).toBeNull()
  })

  it('re-attaching a different document keeps the previous one if another entity still references it', async () => {
    const contract = await createContract(baseContractInput())
    const sharedDocument = await saveDocumentFile(makeFile('shared.pdf', 'application/pdf'), 'other')
    // No UI flow in V1 lets two entities reference the same document, but
    // the cleanup check must stay safe if that were ever possible.
    const { bill } = await createBillWithItems(baseBillInput({ documentId: sharedDocument.id }))
    const newDocument = await saveDocumentFile(makeFile('new.pdf', 'application/pdf'), 'contract')

    await setContractDocument(contract.id, sharedDocument.id)
    await setContractDocument(contract.id, newDocument.id)

    expect((await getDocument(sharedDocument.id))?.deletedAt).toBeNull()
    expect((await getBill(bill.id))?.documentId).toBe(sharedDocument.id)
  })

  it('re-setting the same document is a no-op that does not delete it', async () => {
    const contract = await createContract(baseContractInput())
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    await setContractDocument(contract.id, document.id)

    const updated = await setContractDocument(contract.id, document.id)

    expect(updated.documentId).toBe(document.id)
    expect((await getDocument(document.id))?.deletedAt).toBeNull()
  })

  it('a plain updateContract() call preserves a previously attached document', async () => {
    const contract = await createContract(baseContractInput())
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    await setContractDocument(contract.id, document.id)

    const updated = await updateContract(contract.id, baseContractInput({ monthlyCost: 65 }))

    expect(updated.documentId).toBe(document.id)
    expect(updated.monthlyCost).toBe(65)
  })

  it('removes the document (deleting it) and clears the link, keeping the contract itself', async () => {
    const contract = await createContract(baseContractInput())
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf'), 'contract')
    const attached = await setContractDocument(contract.id, document.id)

    const updated = await removeContractDocument(attached)

    expect(updated.documentId).toBeUndefined()
    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
    expect((await contractRepository.getById(contract.id))?.deletedAt).toBeNull()
  })

  it('is a no-op for a contract with no document', async () => {
    const contract = await createContract(baseContractInput())
    const result = await removeContractDocument(contract)
    expect(result).toEqual(contract)
  })
})

describe('WasteCost + Document lifecycle', () => {
  it('create -> read: a document attached on create is retrievable via getLinkedEntity', async () => {
    const document = await saveDocumentFile(makeFile('gebuehrenbescheid.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    const reloaded = await getWasteCost(wasteCost.id)
    expect(reloaded?.documentId).toBe(document.id)
    expect(await getLinkedEntity(document.id)).toEqual({
      entityType: 'waste',
      entityId: wasteCost.id,
      label: 'Müllkosten 2026',
    })
  })

  it('create -> update: changing fields without touching documentId keeps the attached document', async () => {
    const document = await saveDocumentFile(makeFile('gebuehrenbescheid.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    const updated = await updateWasteCost(wasteCost.id, baseWasteCostInput({ documentId: document.id, amount: 120 }))

    expect(updated.amount).toBe(120)
    expect(updated.documentId).toBe(document.id)
    expect((await getDocument(document.id))?.deletedAt).toBeNull()
  })

  it('create -> update: removing the document (documentId undefined) deletes it once unreferenced', async () => {
    const document = await saveDocumentFile(makeFile('gebuehrenbescheid.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    const updated = await updateWasteCost(wasteCost.id, baseWasteCostInput({ documentId: undefined }))

    expect(updated.documentId).toBeUndefined()
    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
  })

  it('create -> update: swapping to a different document cleans up the previous one once unreferenced', async () => {
    const documentA = await saveDocumentFile(makeFile('a.pdf', 'application/pdf'), 'waste')
    const documentB = await saveDocumentFile(makeFile('b.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: documentA.id }))

    const updated = await updateWasteCost(wasteCost.id, baseWasteCostInput({ documentId: documentB.id }))

    expect(updated.documentId).toBe(documentB.id)
    expect((await getDocument(documentA.id))?.deletedAt).not.toBeNull()
    expect((await getDocument(documentB.id))?.deletedAt).toBeNull()
  })

  it('create -> delete: deletes the linked document when nothing else references it', async () => {
    const document = await saveDocumentFile(makeFile('gebuehrenbescheid.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    await deleteWasteCost(wasteCost.id)

    expect((await getDocument(document.id))?.deletedAt).not.toBeNull()
  })

  it('create -> delete: keeps the document when another live entity still references it', async () => {
    const document = await saveDocumentFile(makeFile('shared.pdf', 'application/pdf'), 'other')
    const { bill } = await createBillWithItems(baseBillInput({ documentId: document.id }))
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    await deleteWasteCost(wasteCost.id)

    expect((await getDocument(document.id))?.deletedAt).toBeNull()
    expect((await getBill(bill.id))?.documentId).toBe(document.id)
  })

  it('is safe to delete a waste cost entry with no document', async () => {
    const wasteCost = await createWasteCost(baseWasteCostInput())
    await expect(deleteWasteCost(wasteCost.id)).resolves.toBeUndefined()
  })

  it('listDocumentsOverview resolves a waste cost as the linked entity', async () => {
    const document = await saveDocumentFile(makeFile('gebuehrenbescheid.pdf', 'application/pdf'), 'waste')
    const wasteCost = await createWasteCost(baseWasteCostInput({ documentId: document.id }))

    const overview = await listDocumentsOverview()
    const entry = overview.find((e) => e.document.id === document.id)
    expect(entry?.linkedEntity).toEqual({ entityType: 'waste', entityId: wasteCost.id, label: 'Müllkosten 2026' })
  })
})

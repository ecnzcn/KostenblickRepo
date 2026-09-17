// Runs under the Node environment (not jsdom) for the same reason as
// documents.test.ts/documentStorage.test.ts: jsdom's File/Blob are not
// preserved by fake-indexeddb's structuredClone-based store emulation, so
// reading bytes back would silently see empty objects instead.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import { contractRepository } from '../domain/repositories/indexedDbRepositories'
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

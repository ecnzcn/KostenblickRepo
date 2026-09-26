// Runs under the Node environment rather than jsdom, for the same reason
// as documentStorage.test.ts/backup.integration.test.ts: this file
// exercises real documentFiles/Blob round-trips through fake-indexeddb,
// which jsdom's Blob/File cannot survive.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import {
  billRepository,
  contractRepository,
  documentRepository,
  reminderRepository,
  wasteCostRepository,
} from '../domain/repositories/indexedDbRepositories'
import { categoryRepository } from '../domain/repositories/categories'
import { createBackup } from '../domain/usecases/backup'
import { createContract } from '../domain/usecases/contracts'
import { saveDocumentFile } from '../domain/usecases/documents'
import { performRestore } from '../domain/usecases/restore'
import { generateId } from '../utils/id'

beforeEach(async () => {
  await deleteDatabase()
})

function makeFile(name: string, type: string, content: string): File {
  return new File([content], name, { type })
}

describe('performRestore (real IndexedDB)', () => {
  it('replaces the current data with the backup - not a merge', async () => {
    const oldWaste = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })
    const backup = await createBackup()

    // A record created only AFTER the backup was taken - restore must
    // remove it, since a full replace means "the backup is now the
    // entire data state", not "add the backup's records on top".
    await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'organic',
      amount: 999,
    })

    await performRestore(backup)

    const remaining = await wasteCostRepository.getAllIncludingDeleted()
    expect(remaining.map((w) => w.id)).toEqual([oldWaste.id])
  })

  it('preserves soft-deleted records exactly (deletedAt, syncVersion, id unchanged)', async () => {
    const waste = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })
    await wasteCostRepository.delete(waste.id)
    const backup = await createBackup()

    await deleteDatabase()
    await performRestore(backup)

    const restored = await wasteCostRepository.getAllIncludingDeleted()
    expect(restored).toHaveLength(1)
    expect(restored[0]?.id).toBe(waste.id)
    expect(restored[0]?.deletedAt).not.toBeNull()
    expect(restored[0]?.syncVersion).toBe(2)
  })

  it('restores contracts and their reminders without regenerating/duplicating them', async () => {
    const contract = await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      cancellationPeriodValue: 3,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })
    const backup = await createBackup()
    const originalReminderCount = backup.data.reminders.length
    expect(originalReminderCount).toBeGreaterThan(0)

    await performRestore(backup)

    const contracts = await contractRepository.getAllIncludingDeleted()
    expect(contracts.map((c) => c.id)).toEqual([contract.id])
    const reminders = await reminderRepository.getAllIncludingDeleted()
    expect(reminders).toHaveLength(originalReminderCount)
  })

  it('restores a document and its file byte-for-byte (ArrayBuffer equality, not just size/type)', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 127, 128, 10, 200])
    const document = await saveDocumentFile(
      new File([bytes], 'rechnung.pdf', { type: 'application/pdf' }),
      'bill',
    )
    const backup = await createBackup()

    await deleteDatabase()
    await performRestore(backup)

    const restoredDocument = await documentRepository.getById(document.id)
    expect(restoredDocument).toBeDefined()

    const db = await getDatabase()
    const restoredFileRecord = await db.get('documentFiles', document.storagePath)
    expect(restoredFileRecord).toBeDefined()
    expect(restoredFileRecord?.blob.type).toBe('application/pdf')

    const restoredBytes = new Uint8Array(await restoredFileRecord!.blob.arrayBuffer())
    expect(restoredBytes.buffer).not.toBe(bytes.buffer)
    expect([...restoredBytes]).toEqual([...bytes])
  })

  it('restores categories from the backup, replacing whatever was seeded/present', async () => {
    const backup = await createBackup()
    const originalCategoryIds = backup.data.categories.map((c) => c.id).sort()

    await categoryRepository.save({
      id: 'zz-extra',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      name: 'Zusatz',
      icon: '⭐',
      type: 'cost',
    })
    await performRestore(backup)

    const restoredCategoryIds = (await categoryRepository.getAll()).map((c) => c.id).sort()
    expect(restoredCategoryIds).toEqual(originalCategoryIds)
  })

  it('leaves all prior data completely unchanged when the restore fails partway through - atomicity', async () => {
    const survivingBill = await billRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      type: 'utility',
      year: 2026,
      totalAmount: 500,
      advancePayments: 0,
      balance: 0,
      balanceType: 'none',
    })
    const survivingWaste = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 42,
    })

    const goodBackup = await createBackup()
    // A record with no `id` (the store's keyPath) is rejected by real
    // IndexedDB itself with a DataError - a genuine, native transaction
    // failure to prove atomicity against, not a mocked one. It sits in
    // one of the stores processed alongside many already-succeeding puts
    // in the same shared transaction.
    const brokenBackup = {
      ...goodBackup,
      data: {
        ...goodBackup.data,
        bills: [
          {
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            deletedAt: null,
            syncVersion: 1,
            userId: 'local-user',
            type: 'utility',
            year: 2026,
            totalAmount: 1,
            advancePayments: 0,
            balance: 0,
            balanceType: 'none',
          },
        ],
        wasteCosts: [
          {
            id: generateId(),
            createdAt: '2026-05-01T00:00:00.000Z',
            updatedAt: '2026-05-01T00:00:00.000Z',
            deletedAt: null,
            syncVersion: 1,
            userId: 'local-user',
            year: 2027,
            category: 'organic' as const,
            amount: 999,
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    await expect(performRestore(brokenBackup)).rejects.toThrow()

    const bills = await billRepository.getAllIncludingDeleted()
    expect(bills.map((b) => b.id)).toEqual([survivingBill.id])
    const wasteCosts = await wasteCostRepository.getAllIncludingDeleted()
    expect(wasteCosts.map((w) => w.id)).toEqual([survivingWaste.id])
  })
})

describe('backup -> modify -> restore roundtrip', () => {
  it('restores full data fidelity, including binary document data, after intervening local changes', async () => {
    const contract = await createContract({
      categoryId: 'strom',
      provider: 'Stadtwerke',
      monthlyCost: 60,
      startDate: '2026-01-01T00:00:00.000Z',
      autoRenewal: false,
      reminderEnabled: false,
    })
    const document = await saveDocumentFile(makeFile('vertrag.pdf', 'application/pdf', 'Original-Vertragsinhalt'), 'contract')
    const originalBackup = await createBackup()

    // Simulate the device being used further after the export: existing
    // data changes, new data is added.
    await contractRepository.save({ ...contract, monthlyCost: 999 })
    await saveDocumentFile(makeFile('neu.pdf', 'application/pdf', 'Neuer Inhalt nach dem Export'), 'waste')

    await performRestore(originalBackup)

    const restoredContract = await contractRepository.getById(contract.id)
    expect(restoredContract?.monthlyCost).toBe(60)

    const restoredDocuments = await documentRepository.getAllIncludingDeleted()
    expect(restoredDocuments.map((d) => d.id)).toEqual([document.id])

    const db = await getDatabase()
    const restoredFile = await db.get('documentFiles', document.storagePath)
    expect(await restoredFile?.blob.text()).toBe('Original-Vertragsinhalt')
  })
})

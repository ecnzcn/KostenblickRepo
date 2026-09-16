import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  createCostEntry,
  deleteCostEntry,
  getCostEntry,
  listCostEntries,
  updateCostEntry,
  validateCostEntryInput,
} from '../domain/usecases/costs'

beforeEach(async () => {
  await deleteDatabase()
})

describe('validateCostEntryInput', () => {
  it('requires category, positive amount and date', () => {
    expect(validateCostEntryInput({ categoryId: '', amount: 0, date: '' })).toEqual([
      'Kategorie ist erforderlich.',
      'Betrag muss größer als 0 sein.',
      'Datum ist erforderlich.',
    ])
  })

  it('accepts a valid input', () => {
    expect(
      validateCostEntryInput({ categoryId: 'heating', amount: 42, date: '2026-09-01T00:00:00.000Z' }),
    ).toEqual([])
  })
})

describe('createCostEntry', () => {
  it('persists a cost entry to IndexedDB', async () => {
    const created = await createCostEntry({
      categoryId: 'heating',
      amount: 42.5,
      date: '2026-09-01T00:00:00.000Z',
      notes: 'Testnotiz',
    })

    expect(created.id).toBeTruthy()
    expect(created.source).toBe('manual')
    expect(created.userId).toBeTruthy()

    const reloaded = await getCostEntry(created.id)
    expect(reloaded?.amount).toBe(42.5)
    expect(reloaded?.notes).toBe('Testnotiz')
  })

  it('rejects invalid input without touching the database', async () => {
    await expect(createCostEntry({ categoryId: '', amount: -1, date: '' })).rejects.toThrow()
    expect(await listCostEntries()).toHaveLength(0)
  })
})

describe('updateCostEntry', () => {
  it('updates fields and bumps updatedAt without creating a new record', async () => {
    const created = await createCostEntry({ categoryId: 'heating', amount: 10, date: '2026-01-01T00:00:00.000Z' })

    await new Promise((resolve) => setTimeout(resolve, 2))
    const updated = await updateCostEntry(created.id, {
      categoryId: 'water',
      amount: 20,
      date: '2026-02-01T00:00:00.000Z',
    })

    expect(updated.id).toBe(created.id)
    expect(updated.categoryId).toBe('water')
    expect(updated.amount).toBe(20)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime())
    expect(updated.createdAt).toBe(created.createdAt)

    expect(await listCostEntries()).toHaveLength(1)
  })

  it('throws when the entry does not exist', async () => {
    await expect(
      updateCostEntry('missing', { categoryId: 'heating', amount: 1, date: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toThrow('nicht gefunden')
  })
})

describe('deleteCostEntry', () => {
  it('soft-deletes: excluded from listCostEntries, but the record itself is preserved', async () => {
    const created = await createCostEntry({ categoryId: 'heating', amount: 10, date: '2026-01-01T00:00:00.000Z' })
    await deleteCostEntry(created.id)

    expect(await listCostEntries()).toHaveLength(0)

    // getById intentionally still returns the raw record (soft delete, not a
    // hard delete) with deletedAt/syncVersion updated for the sync queue.
    const stillPresent = await getCostEntry(created.id)
    expect(stillPresent?.deletedAt).not.toBeNull()
    expect(stillPresent?.syncVersion).toBe(2)
  })
})

describe('listCostEntries', () => {
  it('sorts newest date first', async () => {
    await createCostEntry({ categoryId: 'heating', amount: 1, date: '2026-01-01T00:00:00.000Z' })
    await createCostEntry({ categoryId: 'heating', amount: 2, date: '2026-06-01T00:00:00.000Z' })
    await createCostEntry({ categoryId: 'heating', amount: 3, date: '2026-03-01T00:00:00.000Z' })

    const list = await listCostEntries()
    expect(list.map((entry) => entry.amount)).toEqual([2, 3, 1])
  })
})

describe('data persistence acceptance test', () => {
  it('a created entry survives a simulated app reload (fresh getDatabase() call)', async () => {
    const created = await createCostEntry({ categoryId: 'heating', amount: 99, date: '2026-09-01T00:00:00.000Z' })

    // Simulate the app reloading: close the DB connection, then reopen it
    // exactly as getDatabase() would on a fresh page load.
    const { closeDatabase } = await import('../database/database')
    await closeDatabase()

    const reloaded = await getCostEntry(created.id)
    expect(reloaded?.amount).toBe(99)
  })
})

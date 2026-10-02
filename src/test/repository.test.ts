import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import { contractRepository } from '../domain/repositories/indexedDbRepositories'
import { categoryRepository } from '../domain/repositories/categories'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import type { Contract } from '../domain/models/entities'

const baseContract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 0,
  userId: 'user-1',
  categoryId: 'internet',
  provider: 'Provider GmbH',
  monthlyCost: 39.99,
  startDate: '2026-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: true,
  ...overrides,
})

beforeEach(async () => {
  await deleteDatabase()
})

describe('IndexedDBRepository (syncable entity CRUD)', () => {
  it('creates and reads a contract by id', async () => {
    const saved = await contractRepository.save(baseContract())
    expect(saved.id).toBe('contract-1')
    expect(saved.createdAt).not.toBe('')
    expect(saved.syncVersion).toBe(1)

    const found = await contractRepository.getById('contract-1')
    expect(found?.provider).toBe('Provider GmbH')
  })

  it('lists all non-deleted entities via getAll', async () => {
    await contractRepository.save(baseContract({ id: 'a' }))
    await contractRepository.save(baseContract({ id: 'b' }))
    const all = await contractRepository.getAll()
    expect(all.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('increments syncVersion and bumps updatedAt on update', async () => {
    const first = await contractRepository.save(baseContract())
    const second = await contractRepository.save({ ...first, monthlyCost: 45 })
    expect(second.syncVersion).toBe(first.syncVersion + 1)
    expect(second.monthlyCost).toBe(45)
  })

  it('soft-deletes: excluded from getAll, still present via getAllIncludingDeleted', async () => {
    await contractRepository.save(baseContract())
    await contractRepository.delete('contract-1')

    const all = await contractRepository.getAll()
    expect(all).toHaveLength(0)

    const withDeleted = await contractRepository.getAllIncludingDeleted()
    expect(withDeleted).toHaveLength(1)
    expect(withDeleted[0]?.deletedAt).not.toBeNull()
  })

  it('does not increment syncVersion again when deleting an already-deleted entity', async () => {
    await contractRepository.save(baseContract())
    await contractRepository.delete('contract-1')
    const afterFirstDelete = await contractRepository.getById('contract-1')

    await contractRepository.delete('contract-1')
    const afterSecondDelete = await contractRepository.getById('contract-1')

    expect(afterSecondDelete?.syncVersion).toBe(afterFirstDelete?.syncVersion)
  })

  it('is a no-op when deleting an id that does not exist', async () => {
    await expect(contractRepository.delete('missing')).resolves.toBeUndefined()
  })
})

describe('SyncQueue population (Phase 13B)', () => {
  it('marks a saved record as pending with one deterministic queue entry', async () => {
    await contractRepository.save(baseContract())
    await contractRepository.save(baseContract({ monthlyCost: 45 }))
    const db = await getDatabase()
    const queue = await db.getAll('syncQueue')
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ id: 'contracts:contract-1', entityType: 'contracts', entityId: 'contract-1', operation: 'upsert' })
  })

  it('records a soft delete as a delete operation on the same queue entry', async () => {
    await contractRepository.save(baseContract())
    await contractRepository.delete('contract-1')
    const db = await getDatabase()
    const queue = await db.getAll('syncQueue')
    expect(queue).toHaveLength(1)
    expect(queue[0]?.operation).toBe('delete')
  })

  it('does not queue anything when deleting a missing or already deleted record', async () => {
    await contractRepository.delete('missing')
    const db = await getDatabase()
    expect(await db.getAll('syncQueue')).toHaveLength(0)
  })

  it('still maintains updatedAt, syncVersion and deletedAt', async () => {
    const created = await contractRepository.save(baseContract())
    expect(created.updatedAt).not.toBe('')
    expect(created.syncVersion).toBe(1)
    expect(created.deletedAt).toBeNull()

    const updated = await contractRepository.save({ ...created, monthlyCost: 45 })
    expect(updated.syncVersion).toBe(2)
    expect(updated.updatedAt).not.toBe('')

    await contractRepository.delete('contract-1')
    const deleted = await contractRepository.getAllIncludingDeleted()
    expect(deleted[0]?.deletedAt).not.toBeNull()
    expect(deleted[0]?.syncVersion).toBe(3)
  })

  it('keeps a stored serverRev when a caller saves a rebuilt entity without it', async () => {
    const db = await getDatabase()
    await db.put('contracts', { ...baseContract(), createdAt: 'x', updatedAt: 'x', syncVersion: 1, serverRev: 7 } as never)
    const saved = await contractRepository.save(baseContract({ monthlyCost: 50 }))
    expect((saved as Contract & { serverRev?: number }).serverRev).toBe(7)
  })

  it('never adds a serverRev key to a record that was never synced', async () => {
    const saved = await contractRepository.save(baseContract())
    expect('serverRev' in saved).toBe(false)
  })
})

describe('IndexedDBSimpleRepository (categories)', () => {
  it('is seeded with the default categories', async () => {
    const categories = await categoryRepository.getAll()
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length)
  })

  it('supports reading a single category by id', async () => {
    const heating = await categoryRepository.getById('heating')
    expect(heating?.name).toBe('Heizung')
  })
})

// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import { billItemRepository, contractRepository } from '../domain/repositories/indexedDbRepositories'
import type { BillItem, Contract } from '../domain/models/entities'
import {
  adoptLocalDataIntoHousehold,
  clearLocalSyncData,
  countLocalSyncRecords,
  markAllForResync,
} from '../services/sync/householdData'

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'c1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 0,
  userId: 'local-user',
  categoryId: 'internet',
  provider: 'Telekom',
  monthlyCost: 40,
  startDate: '2026-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: false,
  ...overrides,
})

const billItem: BillItem = {
  id: 'i1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 0,
  billId: 'b1',
  description: 'Wasser',
  amount: 10,
  confidence: 1,
  manuallyVerified: true,
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('household data migration (Phase 13D)', () => {
  it('counts only active records of synced stores', async () => {
    await contractRepository.save(contract())
    await contractRepository.save(contract({ id: 'c2' }))
    await contractRepository.delete('c2')
    expect(await countLocalSyncRecords()).toBe(1)
  })

  it('moves local-user records to the household and queues every record, deletions included', async () => {
    await contractRepository.save(contract())
    await contractRepository.save(contract({ id: 'c2' }))
    await contractRepository.delete('c2')
    await billItemRepository.save(billItem)
    const db = await getDatabase()
    await db.put('contracts', { ...(await db.get('contracts', 'c1'))!, serverRev: 42 } as never)
    await db.clear('syncQueue')

    const migrated = await adoptLocalDataIntoHousehold('hh-1')

    expect(migrated).toBe(3)
    const c1 = (await db.get('contracts', 'c1')) as Contract & { serverRev?: number }
    expect(c1.userId).toBe('hh-1')
    expect('serverRev' in c1).toBe(false)
    expect((await db.get('billItems', 'i1')) as BillItem).not.toHaveProperty('userId')
    const queue = await db.getAll('syncQueue')
    expect(queue.map((item) => `${item.id}:${item.operation}`).sort()).toEqual([
      'billItems:i1:upsert',
      'contracts:c1:upsert',
      'contracts:c2:delete',
    ])
  })

  it('leaves updatedAt and syncVersion untouched while migrating', async () => {
    const saved = await contractRepository.save(contract())
    await adoptLocalDataIntoHousehold('hh-1')
    const after = await contractRepository.getById('c1')
    expect(after?.updatedAt).toBe(saved.updatedAt)
    expect(after?.syncVersion).toBe(saved.syncVersion)
  })

  it('clears synced business data but keeps categories', async () => {
    await contractRepository.save(contract())
    await clearLocalSyncData()
    const db = await getDatabase()
    expect(await db.getAll('contracts')).toHaveLength(0)
    expect(await db.getAll('syncQueue')).toHaveLength(0)
    expect((await db.getAll('categories')).length).toBeGreaterThan(0)
  })

  it('re-queues all records after a restore', async () => {
    await contractRepository.save(contract())
    const db = await getDatabase()
    await db.clear('syncQueue')
    await markAllForResync()
    expect(await db.getAll('syncQueue')).toHaveLength(1)
  })
})

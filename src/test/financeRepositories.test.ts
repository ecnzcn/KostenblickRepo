import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import { STORE_NAMES } from '../database/schema'
import type { Account, Transaction } from '../domain/models/entities'
import { accountRepository, transactionRepository } from '../domain/repositories/financeRepositories'
import { adoptLocalDataIntoHousehold, clearLocalSyncData } from '../services/sync/householdData'
import { isSyncEntityType } from '../services/sync/syncTypes'

const account: Account = {
  id: 'account-1',
  name: 'Girokonto',
  bank: 'sparkasse',
  type: 'giro',
  last4: '0001',
  identifierHash: 'hash',
  identifierSalt: 'salt',
  createdAt: '',
  updatedAt: '',
}

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    accountId: account.id,
    bookingDate: '2026-09-01',
    amount: -10,
    currency: 'EUR',
    counterpartyName: 'Händler',
    purpose: '',
    bookingText: 'KARTENZAHLUNG',
    categorySource: 'none',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'batch-1',
    dedupeKey: `key-${id}:0`,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('finance repositories', () => {
  it('are not sync entity types', () => {
    for (const store of ['accounts', 'transactions', 'importBatches', 'categoryRules', 'savingsGoals']) {
      expect(isSyncEntityType(store)).toBe(false)
    }
  })

  it('saveMany writes all records with timestamps', async () => {
    const saved = await transactionRepository.saveMany([transaction('a'), transaction('b')])
    expect(saved.every((entry) => entry.createdAt && entry.updatedAt)).toBe(true)
    expect(await transactionRepository.getAll()).toHaveLength(2)
  })

  it('saveMany is all-or-nothing on a duplicate booking', async () => {
    await transactionRepository.save(transaction('a'))
    await expect(
      transactionRepository.saveMany([transaction('b'), transaction('c', { dedupeKey: 'key-a:0' })]),
    ).rejects.toBeTruthy()
    expect((await transactionRepository.getAll()).map((entry) => entry.id)).toEqual(['a'])
  })

  it('deletes for real, so the same booking can be imported again', async () => {
    await transactionRepository.saveMany([transaction('a'), transaction('b')])
    await transactionRepository.deleteMany(['a', 'b'])
    expect(await transactionRepository.getAll()).toEqual([])
    await transactionRepository.save(transaction('a2', { dedupeKey: 'key-a:0' }))
    expect(await transactionRepository.getAll()).toHaveLength(1)
  })

  it('finds bookings by index', async () => {
    await transactionRepository.saveMany([transaction('a'), transaction('b', { importBatchId: 'batch-2' })])
    const batch = await transactionRepository.getAllByIndex('importBatchId', 'batch-2')
    expect(batch.map((entry) => entry.id)).toEqual(['b'])
  })

  it('never writes to the sync queue', async () => {
    await accountRepository.save(account)
    await transactionRepository.saveMany([transaction('a')])
    await transactionRepository.save(transaction('b'))
    await transactionRepository.delete('b')
    const db = await getDatabase()
    expect(await db.count(STORE_NAMES.syncQueue)).toBe(0)
  })
})

describe('household join keeps local bookings', () => {
  it('survives "Ersetzen" (clearLocalSyncData)', async () => {
    await accountRepository.save(account)
    await transactionRepository.saveMany([transaction('a')])
    await clearLocalSyncData()
    expect(await accountRepository.getAll()).toHaveLength(1)
    expect(await transactionRepository.getAll()).toHaveLength(1)
  })

  it('is neither changed nor queued by "Zusammenführen" (adoptLocalDataIntoHousehold)', async () => {
    const [saved] = await transactionRepository.saveMany([transaction('a')])
    await adoptLocalDataIntoHousehold('household-1')
    expect(await transactionRepository.getById('a')).toEqual(saved)
    const db = await getDatabase()
    const queued = await db.getAll(STORE_NAMES.syncQueue)
    expect(queued.some((item) => String(item.entityType) === 'transactions')).toBe(false)
  })
})

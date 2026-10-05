import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES, HOUSING_CATEGORY_ID } from '../constants/categories'
import { closeDatabase, createSchema, deleteDatabase, getDatabase } from '../database/database'
import { DATABASE_NAME, DATABASE_VERSION, STORE_NAMES, type KostenblickDB } from '../database/schema'
import type { Category, Contract, Transaction } from '../domain/models/entities'

const LEGACY_CATEGORY_IDS = ['heating', 'water', 'waste', 'property_tax', 'cleaning', 'caretaker', 'insurance', 'electricity', 'internet', 'telecom', 'other']

function legacyCategories(): Category[] {
  return DEFAULT_CATEGORIES.filter((category) => LEGACY_CATEGORY_IDS.includes(category.id)).map(({ group: _group, ...category }) =>
    category.id === 'other' ? { ...category, name: 'Diverses' } : category,
  )
}

const contract: Contract = {
  id: 'contract-1',
  userId: 'local-user',
  provider: 'Stadtwerke',
  categoryId: 'electricity',
  startDate: '2025-01-01',
  monthlyCost: 80,
  reminderEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
} as Contract

/** Leaves a database exactly as release 1.1 (schema v2) did. */
async function createV2Database(): Promise<void> {
  const db = await openDB<KostenblickDB>(DATABASE_NAME, 2, {
    upgrade(database, oldVersion, _newVersion, tx) {
      createSchema(database, oldVersion, tx, 2)
    },
  })
  const tx = db.transaction([STORE_NAMES.categories, STORE_NAMES.contracts], 'readwrite')
  await tx.objectStore(STORE_NAMES.categories).clear()
  for (const category of legacyCategories()) await tx.objectStore(STORE_NAMES.categories).put(category)
  await tx.objectStore(STORE_NAMES.contracts).put(contract)
  await tx.done
  db.close()
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'account-1',
    bookingDate: '2026-09-01',
    amount: -2.5,
    currency: 'EUR',
    counterpartyName: 'Bäckerei',
    purpose: '',
    bookingText: 'KARTENZAHLUNG',
    categorySource: 'none',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'batch-1',
    dedupeKey: 'abc:0',
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('database migration v2 → v3', () => {
  it('keeps existing data and adds the finance stores', async () => {
    await createV2Database()
    const db = await getDatabase()

    expect(db.version).toBe(DATABASE_VERSION)
    for (const store of ['accounts', 'transactions', 'importBatches', 'categoryRules', 'savingsGoals'] as const) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
    expect(await db.get(STORE_NAMES.contracts, contract.id)).toEqual(contract)
  })

  it('adds the new default categories without touching existing ones', async () => {
    await createV2Database()
    const db = await getDatabase()
    const categories = await db.getAll(STORE_NAMES.categories)

    expect(categories.map((category) => category.id).sort()).toEqual(DEFAULT_CATEGORIES.map((category) => category.id).sort())
    expect(categories.find((category) => category.id === 'heating')?.group).toBe(HOUSING_CATEGORY_ID)
    expect(categories.find((category) => category.id === 'other')?.name).toBe('Diverses')
    expect(categories.find((category) => category.id === 'salary')?.type).toBe('income')
  })

  it('does not duplicate or rewrite categories on a later reopen', async () => {
    await createV2Database()
    await getDatabase()
    await closeDatabase()
    const db = await getDatabase()
    expect(await db.getAll(STORE_NAMES.categories)).toHaveLength(DEFAULT_CATEGORIES.length)
  })
})

describe('transactions store', () => {
  it('rejects the same dedupeKey twice for one account', async () => {
    const db = await getDatabase()
    await db.put(STORE_NAMES.transactions, transaction())
    await expect(db.put(STORE_NAMES.transactions, transaction({ id: 'tx-2' }))).rejects.toMatchObject({ name: 'ConstraintError' })
  })

  it('allows the same dedupeKey on another account and again after a hard delete', async () => {
    const db = await getDatabase()
    await db.put(STORE_NAMES.transactions, transaction())
    await db.put(STORE_NAMES.transactions, transaction({ id: 'tx-2', accountId: 'account-2' }))
    await db.delete(STORE_NAMES.transactions, 'tx-1')
    await db.put(STORE_NAMES.transactions, transaction({ id: 'tx-3' }))
    expect(await db.count(STORE_NAMES.transactions)).toBe(2)
  })
})

describe('schema upgrades from a newer release', () => {
  it('releases this connection instead of blocking the upgrade', async () => {
    await getDatabase()
    const newer = await openDB(DATABASE_NAME, DATABASE_VERSION + 1)
    expect(newer.version).toBe(DATABASE_VERSION + 1)
    newer.close()
  })
})

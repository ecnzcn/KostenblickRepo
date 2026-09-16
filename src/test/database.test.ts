import { beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, deleteDatabase, getDatabase } from '../database/database'
import { STORE_NAMES } from '../database/schema'
import { DEFAULT_CATEGORIES } from '../constants/categories'

const REQUIRED_STORES = [
  'bills',
  'billItems',
  'contracts',
  'wasteCosts',
  'costEntries',
  'documents',
  'reminders',
  'categories',
  'syncQueue',
] as const

beforeEach(async () => {
  await deleteDatabase()
})

describe('database initialization', () => {
  it('creates every store required by the architecture', async () => {
    const db = await getDatabase()
    for (const store of REQUIRED_STORES) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })

  it('creates all store names declared in the schema', async () => {
    const db = await getDatabase()
    for (const store of Object.values(STORE_NAMES)) {
      expect(db.objectStoreNames.contains(store)).toBe(true)
    }
  })

  it('seeds the default categories on first initialization', async () => {
    const db = await getDatabase()
    const categories = await db.getAll('categories')
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length)
    const ids = categories.map((category) => category.id).sort()
    expect(ids).toEqual([...DEFAULT_CATEGORIES.map((category) => category.id)].sort())
  })

  it('does not duplicate categories when reopening an existing database (no version bump)', async () => {
    await getDatabase()
    await closeDatabase()
    const db = await getDatabase()
    const categories = await db.getAll('categories')
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length)
  })
})

import { openDB, type IDBPDatabase } from 'idb'
import { DATABASE_NAME, DATABASE_VERSION, STORE_NAMES, type KostenblickDB } from './schema'
import { DEFAULT_CATEGORIES } from '../constants/categories'

let databasePromise: Promise<IDBPDatabase<KostenblickDB>> | undefined

function createSchema(db: IDBPDatabase<KostenblickDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    const users = db.createObjectStore(STORE_NAMES.users)
    users.createIndex('userId', 'id')
    users.createIndex('updatedAt', 'updatedAt')
    users.createIndex('deletedAt', 'deletedAt')

    const properties = db.createObjectStore(STORE_NAMES.properties)
    properties.createIndex('userId', 'userId')
    properties.createIndex('updatedAt', 'updatedAt')
    properties.createIndex('deletedAt', 'deletedAt')

    const bills = db.createObjectStore(STORE_NAMES.bills)
    bills.createIndex('userId', 'userId')
    bills.createIndex('year', 'year')
    bills.createIndex('propertyId', 'propertyId')
    bills.createIndex('updatedAt', 'updatedAt')
    bills.createIndex('deletedAt', 'deletedAt')

    const billItems = db.createObjectStore(STORE_NAMES.billItems)
    billItems.createIndex('billId', 'billId')
    billItems.createIndex('categoryId', 'categoryId')
    billItems.createIndex('updatedAt', 'updatedAt')
    billItems.createIndex('deletedAt', 'deletedAt')

    const categories = db.createObjectStore(STORE_NAMES.categories)
    categories.createIndex('type', 'type')

    const costEntries = db.createObjectStore(STORE_NAMES.costEntries)
    costEntries.createIndex('userId', 'userId')
    costEntries.createIndex('categoryId', 'categoryId')
    costEntries.createIndex('date', 'date')
    costEntries.createIndex('period', 'period')
    costEntries.createIndex('updatedAt', 'updatedAt')
    costEntries.createIndex('deletedAt', 'deletedAt')

    const wasteCosts = db.createObjectStore(STORE_NAMES.wasteCosts)
    wasteCosts.createIndex('userId', 'userId')
    wasteCosts.createIndex('year', 'year')
    wasteCosts.createIndex('category', 'category')
    wasteCosts.createIndex('updatedAt', 'updatedAt')
    wasteCosts.createIndex('deletedAt', 'deletedAt')

    const contracts = db.createObjectStore(STORE_NAMES.contracts)
    contracts.createIndex('userId', 'userId')
    contracts.createIndex('categoryId', 'categoryId')
    contracts.createIndex('endDate', 'endDate')
    contracts.createIndex('calculatedCancellationDate', 'calculatedCancellationDate')
    contracts.createIndex('updatedAt', 'updatedAt')
    contracts.createIndex('deletedAt', 'deletedAt')

    const reminders = db.createObjectStore(STORE_NAMES.reminders)
    reminders.createIndex('userId', 'userId')
    reminders.createIndex('contractId', 'contractId')
    reminders.createIndex('reminderDate', 'reminderDate')
    reminders.createIndex('status', 'status')
    reminders.createIndex('updatedAt', 'updatedAt')
    reminders.createIndex('deletedAt', 'deletedAt')

    const documents = db.createObjectStore(STORE_NAMES.documents)
    documents.createIndex('userId', 'userId')
    documents.createIndex('type', 'type')
    documents.createIndex('updatedAt', 'updatedAt')
    documents.createIndex('deletedAt', 'deletedAt')

    const syncQueue = db.createObjectStore(STORE_NAMES.syncQueue)
    syncQueue.createIndex('entityType', 'entityType')
    syncQueue.createIndex('entityId', 'entityId')
    syncQueue.createIndex('queuedAt', 'queuedAt')

    for (const category of DEFAULT_CATEGORIES) {
      categories.put(category)
    }
  }
}

export function getDatabase(): Promise<IDBPDatabase<KostenblickDB>> {
  databasePromise ??= openDB<KostenblickDB>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion) {
      createSchema(db, oldVersion)
    },
  })
  return databasePromise
}

export async function closeDatabase(): Promise<void> {
  const db = await databasePromise
  db?.close()
  databasePromise = undefined
}

export async function deleteDatabase(): Promise<void> {
  await closeDatabase()
  await indexedDB.deleteDatabase(DATABASE_NAME)
}

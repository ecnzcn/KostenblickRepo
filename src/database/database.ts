import { deleteDB, openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb'
import { DATABASE_NAME, DATABASE_VERSION, STORE_NAMES, type KostenblickDB } from './schema'
import { DEFAULT_CATEGORIES, mergeDefaultCategories } from '../constants/categories'

let databasePromise: Promise<IDBPDatabase<KostenblickDB>> | undefined

type UpgradeTransaction = IDBPTransaction<KostenblickDB, StoreNames<KostenblickDB>[], 'versionchange'>

/**
 * Additive, per-version migration. `upToVersion` exists so tests can build a
 * database exactly as an older release left it and then upgrade it.
 */
export function createSchema(
  db: IDBPDatabase<KostenblickDB>,
  oldVersion: number,
  tx: UpgradeTransaction,
  upToVersion: number = DATABASE_VERSION,
): void {
  if (oldVersion < 1) {
    const users = db.createObjectStore(STORE_NAMES.users, { keyPath: 'id' })
    users.createIndex('userId', 'id')
    users.createIndex('updatedAt', 'updatedAt')
    users.createIndex('deletedAt', 'deletedAt')

    const properties = db.createObjectStore(STORE_NAMES.properties, { keyPath: 'id' })
    properties.createIndex('userId', 'userId')
    properties.createIndex('updatedAt', 'updatedAt')
    properties.createIndex('deletedAt', 'deletedAt')

    const bills = db.createObjectStore(STORE_NAMES.bills, { keyPath: 'id' })
    bills.createIndex('userId', 'userId')
    bills.createIndex('year', 'year')
    bills.createIndex('propertyId', 'propertyId')
    bills.createIndex('updatedAt', 'updatedAt')
    bills.createIndex('deletedAt', 'deletedAt')

    const billItems = db.createObjectStore(STORE_NAMES.billItems, { keyPath: 'id' })
    billItems.createIndex('billId', 'billId')
    billItems.createIndex('categoryId', 'categoryId')
    billItems.createIndex('updatedAt', 'updatedAt')
    billItems.createIndex('deletedAt', 'deletedAt')

    const categories = db.createObjectStore(STORE_NAMES.categories, { keyPath: 'id' })
    categories.createIndex('type', 'type')

    const costEntries = db.createObjectStore(STORE_NAMES.costEntries, { keyPath: 'id' })
    costEntries.createIndex('userId', 'userId')
    costEntries.createIndex('categoryId', 'categoryId')
    costEntries.createIndex('date', 'date')
    costEntries.createIndex('period', 'period')
    costEntries.createIndex('updatedAt', 'updatedAt')
    costEntries.createIndex('deletedAt', 'deletedAt')

    const wasteCosts = db.createObjectStore(STORE_NAMES.wasteCosts, { keyPath: 'id' })
    wasteCosts.createIndex('userId', 'userId')
    wasteCosts.createIndex('year', 'year')
    wasteCosts.createIndex('category', 'category')
    wasteCosts.createIndex('updatedAt', 'updatedAt')
    wasteCosts.createIndex('deletedAt', 'deletedAt')

    const contracts = db.createObjectStore(STORE_NAMES.contracts, { keyPath: 'id' })
    contracts.createIndex('userId', 'userId')
    contracts.createIndex('categoryId', 'categoryId')
    contracts.createIndex('endDate', 'endDate')
    contracts.createIndex('calculatedCancellationDate', 'calculatedCancellationDate')
    contracts.createIndex('updatedAt', 'updatedAt')
    contracts.createIndex('deletedAt', 'deletedAt')

    const reminders = db.createObjectStore(STORE_NAMES.reminders, { keyPath: 'id' })
    reminders.createIndex('userId', 'userId')
    reminders.createIndex('contractId', 'contractId')
    reminders.createIndex('reminderDate', 'reminderDate')
    reminders.createIndex('status', 'status')
    reminders.createIndex('updatedAt', 'updatedAt')
    reminders.createIndex('deletedAt', 'deletedAt')

    const documents = db.createObjectStore(STORE_NAMES.documents, { keyPath: 'id' })
    documents.createIndex('userId', 'userId')
    documents.createIndex('type', 'type')
    documents.createIndex('updatedAt', 'updatedAt')
    documents.createIndex('deletedAt', 'deletedAt')

    const syncQueue = db.createObjectStore(STORE_NAMES.syncQueue, { keyPath: 'id' })
    syncQueue.createIndex('entityType', 'entityType')
    syncQueue.createIndex('entityId', 'entityId')
    syncQueue.createIndex('queuedAt', 'queuedAt')

    for (const category of DEFAULT_CATEGORIES) {
      categories.put(category)
    }
  }

  if (oldVersion < 2 && upToVersion >= 2) {
    db.createObjectStore(STORE_NAMES.documentFiles, { keyPath: 'id' })
  }

  if (oldVersion < 3 && upToVersion >= 3) {
    const accounts = db.createObjectStore(STORE_NAMES.accounts, { keyPath: 'id' })
    accounts.createIndex('type', 'type')
    accounts.createIndex('identifierHash', 'identifierHash')

    const transactions = db.createObjectStore(STORE_NAMES.transactions, { keyPath: 'id' })
    transactions.createIndex('accountId', 'accountId')
    transactions.createIndex('bookingDate', 'bookingDate')
    transactions.createIndex('categoryId', 'categoryId')
    transactions.createIndex('importBatchId', 'importBatchId')
    transactions.createIndex('contractId', 'contractId')
    transactions.createIndex('updatedAt', 'updatedAt')
    transactions.createIndex('accountDedupe', ['accountId', 'dedupeKey'], { unique: true })

    const importBatches = db.createObjectStore(STORE_NAMES.importBatches, { keyPath: 'id' })
    importBatches.createIndex('accountId', 'accountId')
    importBatches.createIndex('importedAt', 'importedAt')

    const categoryRules = db.createObjectStore(STORE_NAMES.categoryRules, { keyPath: 'id' })
    categoryRules.createIndex('priority', 'priority')

    db.createObjectStore(STORE_NAMES.savingsGoals, { keyPath: 'id' })

    // A fresh database was already seeded with the full set above; an
    // existing one only has the pre-Phase-14 defaults.
    if (oldVersion >= 1) {
      const categories = tx.objectStore(STORE_NAMES.categories)
      void categories.getAll().then((existing) => {
        for (const category of mergeDefaultCategories(existing)) void categories.put(category)
      })
    }
  }
}

export function getDatabase(): Promise<IDBPDatabase<KostenblickDB>> {
  databasePromise ??= openDB<KostenblickDB>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      createSchema(db, oldVersion, tx)
    },
    // A newer release opening the database must not hang behind this
    // connection: close it and let the next getDatabase() reopen.
    blocking() {
      void closeDatabase()
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
  await deleteDB(DATABASE_NAME)
}

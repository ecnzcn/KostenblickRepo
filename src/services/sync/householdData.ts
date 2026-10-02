import type { IDBPDatabase } from 'idb'
import { getDatabase } from '../../database/database'
import { STORE_NAMES, type KostenblickDB } from '../../database/schema'
import { buildSyncQueueItem } from '../../domain/repositories/syncQueue'
import { SYNC_ENTITY_TYPES, type LocallySyncedEntity } from './syncTypes'

type DbProvider = () => Promise<IDBPDatabase<KostenblickDB>>

const STORES = [...SYNC_ENTITY_TYPES, STORE_NAMES.syncQueue] as const

/** Number of active (not soft-deleted) records that would take part in sync. */
export async function countLocalSyncRecords(dbProvider: DbProvider = getDatabase): Promise<number> {
  const db = await dbProvider()
  let count = 0
  for (const storeName of SYNC_ENTITY_TYPES) {
    const records = (await db.getAll(storeName)) as LocallySyncedEntity[]
    count += records.filter((record) => record.deletedAt === null).length
  }
  return count
}

/**
 * Hands this device's data over to a household (Phase 13D migration), in
 * ONE readwrite transaction across all sync stores and the queue - like
 * performRestore(), a failing write aborts everything and no store is left
 * half-migrated:
 *
 * - every record carrying a `userId` (V1: 'local-user') gets the household id
 * - every record (soft-deleted ones included, so deletions travel too) is
 *   marked pending and loses any `serverRev` from an earlier household, so
 *   the next sync uploads it as new
 */
export async function adoptLocalDataIntoHousehold(householdId: string, dbProvider: DbProvider = getDatabase): Promise<number> {
  const db = await dbProvider()
  const tx = db.transaction([...STORES], 'readwrite')
  const queue = tx.objectStore(STORE_NAMES.syncQueue)
  const now = new Date().toISOString()
  let migrated = 0

  try {
    await queue.clear()
    for (const storeName of SYNC_ENTITY_TYPES) {
      const store = tx.objectStore(storeName)
      const records = (await store.getAll()) as LocallySyncedEntity[]
      for (const record of records) {
        const { serverRev: _serverRev, ...rest } = record
        const next = 'userId' in rest ? { ...rest, userId: householdId } : rest
        await store.put(next as never)
        await queue.put(buildSyncQueueItem(storeName, record.id, record.deletedAt ? 'delete' : 'upsert', now))
        migrated += 1
      }
    }
    await tx.done
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // already aborted by the failing request
    }
    throw error
  }
  return migrated
}

/**
 * Removes this device's synced business data before it downloads a
 * household it joined ("Ersetzen"). Categories and raw document files are
 * kept (files are only referenced, and stay in any earlier backup).
 */
export async function clearLocalSyncData(dbProvider: DbProvider = getDatabase): Promise<void> {
  const db = await dbProvider()
  const tx = db.transaction([...STORES], 'readwrite')
  for (const storeName of STORES) await tx.objectStore(storeName).clear()
  await tx.done
}

/**
 * After a backup restore on a synced device: every restored record is
 * marked pending again (the server decides per record which version is
 * newer) - the caller also resets the pull cursor so the full server state
 * is fetched once more.
 */
export async function markAllForResync(dbProvider: DbProvider = getDatabase): Promise<void> {
  const db = await dbProvider()
  const tx = db.transaction([...STORES], 'readwrite')
  const queue = tx.objectStore(STORE_NAMES.syncQueue)
  const now = new Date().toISOString()
  for (const storeName of SYNC_ENTITY_TYPES) {
    const records = (await tx.objectStore(storeName).getAll()) as LocallySyncedEntity[]
    for (const record of records) {
      await queue.put(buildSyncQueueItem(storeName, record.id, record.deletedAt ? 'delete' : 'upsert', now))
    }
  }
  await tx.done
}

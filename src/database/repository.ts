import type { IDBPDatabase, IDBPTransaction, IndexNames, StoreNames } from 'idb'
import { STORE_NAMES, type KostenblickDB } from '../database/schema'
import type { SyncableEntity, PersistedEntity } from '../domain/models/entities'
import type { Repository, SyncableRepository } from '../domain/repositories/interfaces'
import { getDatabase } from '../database/database'
import { buildSyncQueueItem } from '../domain/repositories/syncQueue'
import { isSyncEntityType, type LocallySyncedEntity, type SyncEntityType } from '../services/sync/syncTypes'

export function withTimestamps<T extends PersistedEntity>(entity: T, now = new Date().toISOString()): T {
  return { ...entity, createdAt: entity.createdAt || now, updatedAt: now }
}

export function withSyncMetadata<T extends SyncableEntity>(entity: T, now = new Date().toISOString()): T {
  return {
    ...entity,
    createdAt: entity.createdAt || now,
    updatedAt: now,
    deletedAt: entity.deletedAt ?? null,
    syncVersion: entity.syncVersion || 1,
  }
}

export class IndexedDBRepository<T extends SyncableEntity, K extends StoreNames<KostenblickDB>>
  implements SyncableRepository<T> {
  private readonly storeName: K
  private readonly dbProvider: () => Promise<IDBPDatabase<KostenblickDB>>

  constructor(storeName: K, dbProvider: () => Promise<IDBPDatabase<KostenblickDB>> = getDatabase) {
    this.storeName = storeName
    this.dbProvider = dbProvider
  }

  async getById(id: string): Promise<T | undefined> {
    const db = await this.dbProvider()
    return (await db.get(this.storeName, id)) as unknown as T | undefined
  }

  async getAll(): Promise<T[]> {
    const db = await this.dbProvider()
    const entities = await db.getAll(this.storeName)
    return (entities as unknown as T[]).filter((entity) => entity.deletedAt === null)
  }

  async getAllIncludingDeleted(): Promise<T[]> {
    const db = await this.dbProvider()
    return (await db.getAll(this.storeName)) as unknown as T[]
  }

  async save(entity: T): Promise<T> {
    const db = await this.dbProvider()
    const tx = db.transaction(this.transactionStores(), 'readwrite')
    const store = tx.objectStore(this.storeName)
    const existing = (await store.get(entity.id as never)) as unknown as T | undefined
    const next = withSyncMetadata(entity)
    next.syncVersion = existing ? existing.syncVersion + 1 : Math.max(1, entity.syncVersion || 1)
    preserveServerRev(next, entity, existing)
    await store.put(next as never)
    await this.enqueue(tx, entity.id, 'upsert')
    await tx.done
    return next
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbProvider()
    const tx = db.transaction(this.transactionStores(), 'readwrite')
    const store = tx.objectStore(this.storeName)
    const existing = (await store.get(id as never)) as unknown as T | undefined
    if (!existing || existing.deletedAt !== null) {
      await tx.done
      return
    }
    const deleted = withSyncMetadata({ ...existing, deletedAt: new Date().toISOString() })
    deleted.syncVersion += 1
    await store.put(deleted as never)
    await this.enqueue(tx, id, 'delete')
    await tx.done
  }

  private tracksSync(): boolean {
    return isSyncEntityType(this.storeName)
  }

  private transactionStores(): Array<StoreNames<KostenblickDB>> {
    return this.tracksSync() ? [this.storeName, STORE_NAMES.syncQueue] : [this.storeName]
  }

  /** Marks the record as changed-and-not-yet-pushed in the same transaction
   * as the write itself, so a record can never be saved without its marker
   * (or vice versa). */
  private async enqueue(
    tx: IDBPTransaction<KostenblickDB, Array<StoreNames<KostenblickDB>>, 'readwrite'>,
    id: string,
    operation: 'upsert' | 'delete',
  ): Promise<void> {
    if (!this.tracksSync()) return
    await tx.objectStore(STORE_NAMES.syncQueue).put(buildSyncQueueItem(this.storeName as SyncEntityType, id, operation))
  }
}

/** `serverRev` is sync bookkeeping that callers (use cases rebuilding an
 * entity from form input) don't carry along - keep the stored value unless
 * the caller explicitly provides one. Never adds the key when there is
 * nothing to keep, so never-synced records look exactly as before. */
function preserveServerRev<T extends SyncableEntity>(next: T, incoming: T, existing: T | undefined): void {
  const incomingRev = (incoming as LocallySyncedEntity).serverRev
  const existingRev = (existing as LocallySyncedEntity | undefined)?.serverRev
  const rev = incomingRev ?? existingRev
  if (rev !== undefined) (next as LocallySyncedEntity).serverRev = rev
}

export class IndexedDBSimpleRepository<T extends PersistedEntity, K extends StoreNames<KostenblickDB>>
  implements Repository<T> {
  private readonly storeName: K
  private readonly dbProvider: () => Promise<IDBPDatabase<KostenblickDB>>

  constructor(storeName: K, dbProvider: () => Promise<IDBPDatabase<KostenblickDB>> = getDatabase) {
    this.storeName = storeName
    this.dbProvider = dbProvider
  }

  async getById(id: string): Promise<T | undefined> {
    const db = await this.dbProvider()
    return (await db.get(this.storeName, id)) as unknown as T | undefined
  }

  async getAll(): Promise<T[]> {
    const db = await this.dbProvider()
    return (await db.getAll(this.storeName)) as unknown as T[]
  }

  async save(entity: T): Promise<T> {
    const db = await this.dbProvider()
    const next = withTimestamps(entity)
    await db.put(this.storeName, next as never)
    return next
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbProvider()
    await db.delete(this.storeName, id)
  }

  /** All-or-nothing: one transaction, so a failing record (e.g. a unique
   * index violation) leaves none of the batch behind. */
  async saveMany(entities: readonly T[]): Promise<T[]> {
    const db = await this.dbProvider()
    const tx = db.transaction(this.storeName, 'readwrite')
    const now = new Date().toISOString()
    const saved = entities.map((entity) => withTimestamps(entity, now))
    await Promise.all([...saved.map((entity) => tx.store.put(entity as never)), tx.done])
    return saved
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    const db = await this.dbProvider()
    const tx = db.transaction(this.storeName, 'readwrite')
    await Promise.all([...ids.map((id) => tx.store.delete(id as never)), tx.done])
  }

  async getAllByIndex(indexName: IndexNames<KostenblickDB, K>, value: string): Promise<T[]> {
    const db = await this.dbProvider()
    return (await db.getAllFromIndex(this.storeName, indexName, value as never)) as unknown as T[]
  }
}

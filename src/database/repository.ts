import type { IDBPDatabase, StoreNames } from 'idb'
import type { KostenblickDB } from '../database/schema'
import type { EntityType, SyncableEntity, PersistedEntity } from '../domain/models/entities'
import type { Repository, SyncableRepository } from '../domain/repositories/interfaces'
import { getDatabase } from '../database/database'
import { enqueueSyncChange } from '../domain/repositories/syncQueue'

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
  private readonly entityType: EntityType
  private readonly dbProvider: () => Promise<IDBPDatabase<KostenblickDB>>

  constructor(
    storeName: K,
    entityType: EntityType,
    dbProvider: () => Promise<IDBPDatabase<KostenblickDB>> = getDatabase,
  ) {
    this.storeName = storeName
    this.entityType = entityType
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
    const existing = (await db.get(this.storeName, entity.id)) as unknown as T | undefined
    const next = withSyncMetadata(entity)
    next.syncVersion = existing ? existing.syncVersion + 1 : Math.max(1, entity.syncVersion || 1)
    await db.put(this.storeName, next as never)
    await enqueueSyncChange(this.entityType, next.id, 'upsert')
    return next
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbProvider()
    const existing = (await db.get(this.storeName, id)) as unknown as T | undefined
    if (!existing || existing.deletedAt !== null) return
    const deleted = withSyncMetadata({ ...existing, deletedAt: new Date().toISOString() })
    deleted.syncVersion += 1
    await db.put(this.storeName, deleted as never)
    await enqueueSyncChange(this.entityType, id, 'delete')
  }
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
}

import type { IDBPDatabase } from 'idb'
import { getDatabase } from '../../database/database'
import { STORE_NAMES, type KostenblickDB } from '../../database/schema'
import { syncQueueKey } from '../../domain/repositories/syncQueue'
import type { SyncLocalStore } from './SyncEngine'
import { toServerData } from './SyncEngine'
import {
  isSyncEntityType,
  SYNC_ENTITY_TYPES,
  type LocallySyncedEntity,
  type PushChange,
  type PushResult,
  type SyncEntityType,
  type SyncRecord,
} from './syncTypes'

const SYNC_STORES = [...SYNC_ENTITY_TYPES, STORE_NAMES.syncQueue] as const

/**
 * SyncLocalStore on top of the app's IndexedDB. Pulled and acknowledged
 * records are written directly into the stores (like restore.ts does),
 * never through IndexedDBRepository.save() - that would re-mark them as
 * locally changed and bump updatedAt/syncVersion. Every batch is one
 * readwrite transaction across all sync stores plus the queue.
 */
export class IndexedDbSyncLocalStore implements SyncLocalStore {
  private readonly dbProvider: () => Promise<IDBPDatabase<KostenblickDB>>

  constructor(dbProvider: () => Promise<IDBPDatabase<KostenblickDB>> = getDatabase) {
    this.dbProvider = dbProvider
  }

  async getPendingChanges(): Promise<PushChange[]> {
    const db = await this.dbProvider()
    const tx = db.transaction([...SYNC_STORES], 'readwrite')
    const queue = await tx.objectStore(STORE_NAMES.syncQueue).index('queuedAt').getAll()
    const changes: PushChange[] = []
    for (const item of queue) {
      if (!isSyncEntityType(item.entityType)) continue
      const entity = (await tx.objectStore(item.entityType).get(item.entityId)) as LocallySyncedEntity | undefined
      if (!entity) {
        // Nothing left to push (record vanished, e.g. through a restore).
        await tx.objectStore(STORE_NAMES.syncQueue).delete(item.id)
        continue
      }
      changes.push({
        entityType: item.entityType,
        id: item.entityId,
        data: toServerData(entity),
        updatedAt: entity.updatedAt,
        baseRev: entity.serverRev ?? null,
      })
    }
    await tx.done
    return changes
  }

  async acknowledgePush(sent: PushChange[], results: PushResult[]): Promise<void> {
    const sentByKey = new Map(sent.map((change) => [syncQueueKey(change.entityType, change.id), change]))
    const db = await this.dbProvider()
    const tx = db.transaction([...SYNC_STORES], 'readwrite')
    const queue = tx.objectStore(STORE_NAMES.syncQueue)

    for (const result of results) {
      const key = syncQueueKey(result.entityType, result.id)
      const change = sentByKey.get(key)
      if (!change) continue
      const store = tx.objectStore(result.entityType)
      const current = (await store.get(result.id)) as LocallySyncedEntity | undefined
      const unchangedSincePush = current !== undefined && isSameVersion(current, change)

      if (result.status === 'applied') {
        if (!current) continue
        await store.put({ ...current, serverRev: result.rev } as never)
        if (unchangedSincePush) await queue.delete(key)
        continue
      }

      // rejected: the server's newer version wins ...
      if (current && !unchangedSincePush) {
        // ... unless this device edited the record again in the meantime:
        // that edit is newer still - keep it pending, now based on the
        // server's revision, so the next push settles it.
        await store.put({ ...current, serverRev: result.server.rev } as never)
        continue
      }
      await store.put({ ...result.server.data, serverRev: result.server.rev } as never)
      await queue.delete(key)
    }
    await tx.done
  }

  async applyPulled(records: SyncRecord[]): Promise<void> {
    const db = await this.dbProvider()
    const tx = db.transaction([...SYNC_STORES], 'readwrite')
    const queue = tx.objectStore(STORE_NAMES.syncQueue)

    for (const record of records) {
      if (!isValidRecord(record)) continue
      if (await queue.get(syncQueueKey(record.entityType, record.id))) continue
      const store = tx.objectStore(record.entityType)
      const current = (await store.get(record.id)) as LocallySyncedEntity | undefined
      if (current?.serverRev !== undefined && current.serverRev >= record.rev) continue
      await store.put({ ...record.data, serverRev: record.rev } as never)
    }
    await tx.done
  }
}

function isSameVersion(current: LocallySyncedEntity, sent: PushChange): boolean {
  return current.updatedAt === sent.updatedAt && current.syncVersion === sent.data.syncVersion
}

/** Defensive check on server input before it touches IndexedDB. */
function isValidRecord(record: SyncRecord): record is SyncRecord & { entityType: SyncEntityType } {
  return (
    isSyncEntityType(record.entityType) &&
    typeof record.rev === 'number' &&
    record.data !== null &&
    typeof record.data === 'object' &&
    record.data.id === record.id &&
    typeof record.data.updatedAt === 'string'
  )
}

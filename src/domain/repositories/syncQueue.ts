import { getDatabase } from '../../database/database'
import type { EntityType, SyncQueueItem } from '../models/entities'

/**
 * The sync queue marks which records changed locally and still have to be
 * pushed. The key is deterministic per record (`<entityType>:<entityId>`),
 * so repeated edits of the same record overwrite one entry instead of
 * piling up - the queue is bounded by the number of records and never grows
 * without limit, even while sync is not configured (Phase 13B).
 */
export function syncQueueKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export function buildSyncQueueItem(
  entityType: EntityType,
  entityId: string,
  operation: SyncQueueItem['operation'],
  now = new Date().toISOString(),
): SyncQueueItem {
  return {
    id: syncQueueKey(entityType, entityId),
    entityType,
    entityId,
    operation,
    queuedAt: now,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export async function enqueueSyncChange(
  entityType: EntityType,
  entityId: string,
  operation: SyncQueueItem['operation'],
): Promise<SyncQueueItem> {
  const db = await getDatabase()
  const item = buildSyncQueueItem(entityType, entityId, operation)
  await db.put('syncQueue', item)
  return item
}

export async function getPendingSyncChanges(): Promise<SyncQueueItem[]> {
  const db = await getDatabase()
  return db.getAllFromIndex('syncQueue', 'queuedAt')
}

export async function removeSyncChange(id: string): Promise<void> {
  const db = await getDatabase()
  await db.delete('syncQueue', id)
}

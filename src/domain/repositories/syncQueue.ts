import { getDatabase } from '../../database/database'
import type { EntityType, SyncQueueItem } from '../models/entities'

export async function enqueueSyncChange(
  entityType: EntityType,
  entityId: string,
  operation: SyncQueueItem['operation'],
): Promise<SyncQueueItem> {
  const db = await getDatabase()
  const now = new Date().toISOString()
  const item: SyncQueueItem = {
    id: crypto.randomUUID(),
    entityType,
    entityId,
    operation,
    queuedAt: now,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  }
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

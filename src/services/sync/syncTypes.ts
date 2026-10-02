import type { SyncableEntity } from '../../domain/models/entities'

/**
 * Entity types that take part in sync. `users` (unused since V1) and
 * `categories` (fixed seed, no Soft-Delete/syncVersion) are deliberately
 * excluded; raw document bytes (`documentFiles`) travel through a separate
 * file pipeline (Phase 13F), never as sync records.
 */
export const SYNC_ENTITY_TYPES = [
  'properties',
  'bills',
  'billItems',
  'costEntries',
  'wasteCosts',
  'contracts',
  'reminders',
  'documents',
] as const

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]

export function isSyncEntityType(value: string): value is SyncEntityType {
  return (SYNC_ENTITY_TYPES as readonly string[]).includes(value)
}

/** A syncable entity as stored locally: `serverRev` is the server revision
 * this device last saw for the record (absent = never synced). It is local
 * bookkeeping only and is stripped before a record is sent to the server. */
export type LocallySyncedEntity = SyncableEntity & { serverRev?: number }

/** One record as the server holds it. `rev` is assigned by the server from
 * a per-household monotonic sequence and is the only ordering the client
 * relies on (never the device clock). */
export interface SyncRecord {
  entityType: SyncEntityType
  id: string
  data: SyncableEntity
  updatedAt: string
  rev: number
}

/** A local change on its way to the server. `baseRev` is the server
 * revision the change was made on top of (null = record is new to us). */
export interface PushChange {
  entityType: SyncEntityType
  id: string
  data: SyncableEntity
  updatedAt: string
  baseRev: number | null
}

/**
 * Server verdict for one pushed change:
 * - `applied`: the change is now the server state at `rev`. When `conflict`
 *   is true another device had changed the record meanwhile, but this
 *   change was newer (`updatedAt`) and won; `previous` is the overwritten
 *   server version.
 * - `rejected`: another device's newer version wins; `server` is that
 *   version and replaces the local one.
 */
export type PushResult =
  | { entityType: SyncEntityType; id: string; status: 'applied'; rev: number; conflict: boolean; previous?: SyncRecord }
  | { entityType: SyncEntityType; id: string; status: 'rejected'; server: SyncRecord }

export interface PullPage {
  records: SyncRecord[]
  hasMore: boolean
}

/** Transport to a sync server for exactly one household. Implemented by the
 * Supabase transport and by an in-memory fake server for tests. */
export interface SyncTransport {
  push(changes: PushChange[]): Promise<PushResult[]>
  pull(sinceRev: number, limit: number): Promise<PullPage>
}

/** A version that lost a conflict - kept in a local log instead of being
 * silently discarded, so nothing is lost without a trace. */
export interface SyncConflictEntry {
  entityType: SyncEntityType
  id: string
  resolvedAt: string
  winner: 'local' | 'server'
  losingVersion: SyncableEntity
}

export interface SyncRunResult {
  pushed: number
  pulled: number
  conflicts: SyncConflictEntry[]
  cursor: number
}

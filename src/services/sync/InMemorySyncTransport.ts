import type { SyncableEntity } from '../../domain/models/entities'
import { changedKeys, protectedFields, type PullPage, type PushChange, type PushResult, type SyncRecord, type SyncTransport } from './syncTypes'

/**
 * In-memory stand-in for the Supabase backend of one household. It
 * implements exactly the same push/pull semantics as the SQL functions in
 * `supabase/migrations` (`sync_push` / pull by revision), so the whole
 * client-side flow - two devices, conflicts, re-pulls - is testable without
 * a network. Several transports can share one server to simulate several
 * devices.
 */
export class InMemorySyncServer {
  private readonly records = new Map<string, SyncRecord>()
  /** Every revision a record ever held, so a real conflict (baseRev != the
   * record's current rev) can be resolved against the exact snapshot the
   * pushing device actually started from - see resolveConflict() below. */
  private readonly history = new Map<string, SyncRecord>()
  private rev = 0

  push(changes: PushChange[]): PushResult[] {
    return changes.map((change) => {
      const key = `${change.entityType}:${change.id}`
      const current = this.records.get(key)

      if (!current || current.rev === change.baseRev) {
        return { entityType: change.entityType, id: change.id, status: 'applied', rev: this.store(key, change).rev, conflict: false }
      }
      return this.resolveConflict(key, change, current)
    })
  }

  /**
   * Real conflict: another device changed the record since `change.baseRev`.
   * Diffs the incoming change and the current server state against the
   * snapshot at `baseRev` (not against each other) to see which fields each
   * side actually touched:
   *  - disjoint fields  -> merge both edits, nothing lost, no conflict flag.
   *  - overlap, but only on fields that may be resolved by clock
   *    (`protectedFields` excluded) -> newer `updatedAt` wins, as before.
   *  - overlap on a protected field, or the base snapshot is gone (e.g. an
   *    old/lying client) -> reject outright; the caller keeps its own
   *    version locally, the server version is untouched. Never a silent
   *    pick between two diverging money/contract-deadline values.
   *  - the server's current version is a tombstone and the incoming change
   *    tries to clear `deletedAt` -> reject (no silent resurrection).
   */
  private resolveConflict(key: string, change: PushChange, current: SyncRecord): PushResult {
    const currentData = current.data as unknown as Record<string, unknown>
    if (currentData.deletedAt != null && (change.data as unknown as Record<string, unknown>).deletedAt == null) {
      return { entityType: change.entityType, id: change.id, status: 'rejected', server: structuredClone(current) }
    }

    const baseline = change.baseRev === null ? undefined : this.history.get(`${key}:${change.baseRev}`)
    if (!baseline) {
      return { entityType: change.entityType, id: change.id, status: 'rejected', server: structuredClone(current) }
    }

    const baselineData = baseline.data as unknown as Record<string, unknown>
    const clientChanged = changedKeys(baselineData, change.data as unknown as Record<string, unknown>)
    const serverChanged = changedKeys(baselineData, currentData)
    const overlap = [...clientChanged].filter((k) => serverChanged.has(k))
    const protected_ = new Set(protectedFields(change.entityType))

    if (overlap.length === 0) {
      const changeData = change.data as unknown as Record<string, unknown>
      const merged = { ...currentData }
      for (const field of clientChanged) merged[field] = changeData[field]
      const updatedAt = change.updatedAt > current.updatedAt ? change.updatedAt : current.updatedAt
      merged.updatedAt = updatedAt
      return {
        entityType: change.entityType,
        id: change.id,
        status: 'applied',
        rev: this.store(key, { ...change, data: merged as unknown as SyncableEntity, updatedAt }).rev,
        conflict: false,
      }
    }

    if (overlap.some((field) => protected_.has(field))) {
      return { entityType: change.entityType, id: change.id, status: 'rejected', server: structuredClone(current) }
    }

    // Overlap, but only on fields clock order may settle.
    if (change.updatedAt > current.updatedAt) {
      const previous = structuredClone(current)
      return { entityType: change.entityType, id: change.id, status: 'applied', rev: this.store(key, change).rev, conflict: true, previous }
    }
    return { entityType: change.entityType, id: change.id, status: 'rejected', server: structuredClone(current) }
  }

  private store(key: string, change: PushChange): SyncRecord {
    this.rev += 1
    const record: SyncRecord = {
      entityType: change.entityType,
      id: change.id,
      data: structuredClone(change.data),
      updatedAt: change.updatedAt,
      rev: this.rev,
    }
    this.records.set(key, record)
    this.history.set(`${key}:${record.rev}`, record)
    return record
  }

  pull(sinceRev: number, limit: number): PullPage {
    const newer = [...this.records.values()].filter((record) => record.rev > sinceRev).sort((a, b) => a.rev - b.rev)
    return { records: structuredClone(newer.slice(0, limit)), hasMore: newer.length > limit }
  }

  all(): SyncRecord[] {
    return [...this.records.values()].sort((a, b) => a.rev - b.rev)
  }
}

export class InMemorySyncTransport implements SyncTransport {
  private readonly server: InMemorySyncServer

  constructor(server: InMemorySyncServer) {
    this.server = server
  }

  async push(changes: PushChange[]): Promise<PushResult[]> {
    return this.server.push(changes)
  }

  async pull(sinceRev: number, limit: number): Promise<PullPage> {
    return this.server.pull(sinceRev, limit)
  }
}

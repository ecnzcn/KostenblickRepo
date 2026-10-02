import type { SyncableEntity } from '../../domain/models/entities'
import type {
  PushChange,
  PushResult,
  SyncConflictEntry,
  SyncRecord,
  SyncRunResult,
  SyncTransport,
} from './syncTypes'

/**
 * Local side of a sync run. Implemented on top of IndexedDB for the app
 * (IndexedDbSyncLocalStore) and in memory for multi-device tests.
 */
export interface SyncLocalStore {
  /** Every locally changed record that still has to be pushed. */
  getPendingChanges(): Promise<PushChange[]>
  /**
   * Applies the server's verdicts for a batch of pushed changes:
   * `applied` → remember the new server revision and clear the pending
   * marker, unless the record was edited again while the push was in
   * flight (then it stays pending, now on top of the new revision);
   * `rejected` → replace the local record with the winning server version.
   */
  acknowledgePush(sent: PushChange[], results: PushResult[]): Promise<void>
  /**
   * Writes records pulled from the server. A record that is pending locally
   * is skipped - the local change is pushed next and the server decides the
   * conflict; a record already known at the same or a newer revision is
   * skipped as well (idempotent re-pull).
   */
  applyPulled(records: SyncRecord[]): Promise<void>
}

export interface SyncCursorStore {
  get(): number
  set(cursor: number): void
}

export interface SyncEngineOptions {
  pushBatchSize?: number
  pullPageSize?: number
  now?: () => string
}

const DEFAULT_PUSH_BATCH = 200
const DEFAULT_PULL_PAGE = 500

/**
 * One sync pass: push all pending local changes, then pull everything the
 * server has beyond this device's cursor. Push first, so a device's own
 * changes are settled (accepted or rejected) before remote state is merged
 * in. Conflicts are resolved by the server (see SQL `sync_push`); the
 * engine only records the losing versions.
 */
export class SyncEngine {
  private readonly transport: SyncTransport
  private readonly local: SyncLocalStore
  private readonly cursor: SyncCursorStore
  private readonly pushBatchSize: number
  private readonly pullPageSize: number
  private readonly now: () => string

  constructor(transport: SyncTransport, local: SyncLocalStore, cursor: SyncCursorStore, options: SyncEngineOptions = {}) {
    this.transport = transport
    this.local = local
    this.cursor = cursor
    this.pushBatchSize = options.pushBatchSize ?? DEFAULT_PUSH_BATCH
    this.pullPageSize = options.pullPageSize ?? DEFAULT_PULL_PAGE
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async run(): Promise<SyncRunResult> {
    const conflicts: SyncConflictEntry[] = []

    const pending = await this.local.getPendingChanges()
    for (let start = 0; start < pending.length; start += this.pushBatchSize) {
      const batch = pending.slice(start, start + this.pushBatchSize)
      const results = await this.transport.push(batch)
      validatePushResults(batch, results)
      await this.local.acknowledgePush(batch, results)
      conflicts.push(...this.collectConflicts(batch, results))
    }

    let cursor = this.cursor.get()
    let pulled = 0
    for (;;) {
      const page = await this.transport.pull(cursor, this.pullPageSize)
      if (page.records.length > 0) {
        await this.local.applyPulled(page.records)
        pulled += page.records.length
        cursor = Math.max(cursor, ...page.records.map((record) => record.rev))
        this.cursor.set(cursor)
      }
      if (!page.hasMore || page.records.length === 0) break
    }

    return { pushed: pending.length, pulled, conflicts, cursor }
  }

  private collectConflicts(sent: PushChange[], results: PushResult[]): SyncConflictEntry[] {
    const byKey = new Map(sent.map((change) => [`${change.entityType}:${change.id}`, change]))
    const entries: SyncConflictEntry[] = []
    for (const result of results) {
      if (result.status === 'rejected') {
        const loser = byKey.get(`${result.entityType}:${result.id}`)
        if (loser) entries.push(this.entry(result.entityType, result.id, 'server', loser.data))
      } else if (result.conflict && result.previous) {
        entries.push(this.entry(result.entityType, result.id, 'local', result.previous.data))
      }
    }
    return entries
  }

  private entry(
    entityType: SyncConflictEntry['entityType'],
    id: string,
    winner: SyncConflictEntry['winner'],
    losingVersion: SyncableEntity,
  ): SyncConflictEntry {
    return { entityType, id, winner, losingVersion, resolvedAt: this.now() }
  }
}

function validatePushResults(sent: PushChange[], results: PushResult[]): void {
  const expected = new Set(sent.map((change) => `${change.entityType}:${change.id}`))
  for (const result of results) {
    if (!expected.has(`${result.entityType}:${result.id}`)) {
      throw new Error('Der Server hat eine unerwartete Antwort auf die Synchronisierung geschickt.')
    }
  }
}

/** Strips local-only bookkeeping before a record leaves the device. */
export function toServerData<T extends SyncableEntity>(entity: T): SyncableEntity {
  const { serverRev: _serverRev, ...rest } = entity as T & { serverRev?: number }
  return rest as SyncableEntity
}

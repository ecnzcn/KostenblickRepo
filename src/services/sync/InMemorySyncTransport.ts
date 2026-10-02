import type { PullPage, PushChange, PushResult, SyncRecord, SyncTransport } from './syncTypes'

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
  private rev = 0

  push(changes: PushChange[]): PushResult[] {
    return changes.map((change) => {
      const key = `${change.entityType}:${change.id}`
      const current = this.records.get(key)
      const store = (): SyncRecord => {
        this.rev += 1
        const record: SyncRecord = {
          entityType: change.entityType,
          id: change.id,
          data: structuredClone(change.data),
          updatedAt: change.updatedAt,
          rev: this.rev,
        }
        this.records.set(key, record)
        return record
      }

      if (!current || current.rev === change.baseRev) {
        return { entityType: change.entityType, id: change.id, status: 'applied', rev: store().rev, conflict: false }
      }
      // Someone else changed the record since this device last saw it:
      // the newer edit wins, ties go to the server (already persisted).
      if (change.updatedAt > current.updatedAt) {
        const previous = structuredClone(current)
        return { entityType: change.entityType, id: change.id, status: 'applied', rev: store().rev, conflict: true, previous }
      }
      return { entityType: change.entityType, id: change.id, status: 'rejected', server: structuredClone(current) }
    })
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

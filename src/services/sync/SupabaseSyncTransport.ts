import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncableEntity } from '../../domain/models/entities'
import type { PullPage, PushChange, PushResult, SyncEntityType, SyncRecord, SyncTransport } from './syncTypes'

interface SyncRecordRow {
  entity_type: SyncEntityType
  id: string
  data: SyncableEntity
  updated_at: string
  rev: number | string
}

/**
 * SyncTransport for one household on Supabase: push through the
 * `sync_push` function (conflict handling happens in the database), pull
 * as a plain RLS-protected select ordered by server revision.
 */
export class SupabaseSyncTransport implements SyncTransport {
  private readonly client: SupabaseClient
  private readonly householdId: string

  constructor(client: SupabaseClient, householdId: string) {
    this.client = client
    this.householdId = householdId
  }

  async push(changes: PushChange[]): Promise<PushResult[]> {
    if (changes.length === 0) return []
    const { data, error } = await this.client.rpc('sync_push', { p_household: this.householdId, p_changes: changes })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Der Server hat eine unerwartete Antwort auf die Synchronisierung geschickt.')
    return (data as PushResult[]).map(normalizePushResult)
  }

  async pull(sinceRev: number, limit: number): Promise<PullPage> {
    const { data, error } = await this.client
      .from('sync_records')
      .select('entity_type,id,data,updated_at,rev')
      .eq('household_id', this.householdId)
      .gt('rev', sinceRev)
      .order('rev', { ascending: true })
      .limit(limit + 1)
    if (error) throw error
    const rows = (data ?? []) as SyncRecordRow[]
    return { records: rows.slice(0, limit).map(fromRow), hasMore: rows.length > limit }
  }
}

function fromRow(row: SyncRecordRow): SyncRecord {
  return { entityType: row.entity_type, id: row.id, data: row.data, updatedAt: row.updated_at, rev: Number(row.rev) }
}

/** bigint revisions may arrive as strings depending on the API layer. */
function normalizePushResult(result: PushResult): PushResult {
  if (result.status === 'applied') {
    return {
      ...result,
      rev: Number(result.rev),
      previous: result.previous ? { ...result.previous, rev: Number(result.previous.rev) } : undefined,
    }
  }
  return { ...result, server: { ...result.server, rev: Number(result.server.rev) } }
}

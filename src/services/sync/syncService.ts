import { IndexedDbSyncLocalStore } from './IndexedDbSyncLocalStore'
import { SupabaseSyncTransport } from './SupabaseSyncTransport'
import { SyncEngine } from './SyncEngine'
import { describeSyncError } from './syncErrors'
import { markAllForResync } from './householdData'
import { getSupabaseClient } from './supabaseClient'
import {
  appendConflictLog,
  getHouseholdMembership,
  getSyncCursor,
  getSyncStatus,
  resetSyncCursor,
  saveSyncCursor,
  saveSyncStatus,
} from './syncSettings'
import type { SyncRunResult } from './syncTypes'

export type SyncOutcome =
  | { kind: 'skipped'; reason: 'not_configured' | 'no_household' | 'signed_out' }
  | { kind: 'success'; result: SyncRunResult }
  | { kind: 'error'; message: string }

export const SYNC_FINISHED_EVENT = 'kostenblick:sync-finished'

let inFlight: Promise<SyncOutcome> | undefined

/**
 * Runs one sync pass for this device's household. Concurrent callers (app
 * start, return to foreground, manual button) share the pass in flight
 * instead of starting a second one. Never throws: failures come back as an
 * outcome with a German message, local data stays untouched.
 */
export function runSync(): Promise<SyncOutcome> {
  inFlight ??= performSync().finally(() => {
    inFlight = undefined
  })
  return inFlight
}

async function performSync(): Promise<SyncOutcome> {
  const client = await getSupabaseClient()
  if (!client) return { kind: 'skipped', reason: 'not_configured' }
  const membership = getHouseholdMembership()
  if (!membership) return { kind: 'skipped', reason: 'no_household' }

  try {
    const { data } = await client.auth.getSession()
    if (!data.session) return { kind: 'skipped', reason: 'signed_out' }
  } catch (error) {
    return { kind: 'error', message: describeSyncError(error) }
  }

  const householdId = membership.householdId
  const engine = new SyncEngine(new SupabaseSyncTransport(client, householdId), new IndexedDbSyncLocalStore(), {
    get: () => getSyncCursor(householdId),
    set: (cursor) => saveSyncCursor(householdId, cursor),
  })

  try {
    const result = await engine.run()
    appendConflictLog(result.conflicts)
    saveSyncStatus({ lastSyncAt: new Date().toISOString(), lastPushed: result.pushed, lastPulled: result.pulled })
    notifyFinished(result)
    return { kind: 'success', result }
  } catch (error) {
    const message = describeSyncError(error)
    saveSyncStatus({ ...getSyncStatus(), lastError: message })
    return { kind: 'error', message }
  }
}

function notifyFinished(result: SyncRunResult): void {
  try {
    window.dispatchEvent(new CustomEvent<SyncRunResult>(SYNC_FINISHED_EVENT, { detail: result }))
  } catch {
    // no window (tests under node) - nothing to notify
  }
}

/** Called after a backup restore: a synced device re-offers all restored
 * records to the server and re-pulls the full server state once. */
export async function handleLocalDataRestored(): Promise<void> {
  const membership = getHouseholdMembership()
  if (!membership) return
  await markAllForResync()
  resetSyncCursor(membership.householdId)
}

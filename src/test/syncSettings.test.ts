import { beforeEach, describe, expect, it } from 'vitest'
import { describeSyncError } from '../services/sync/syncErrors'
import { runSync } from '../services/sync/syncService'
import {
  appendConflictLog,
  getConflictLog,
  getCurrentOwnerId,
  getSyncCursor,
  getSyncServerConfig,
  saveHouseholdMembership,
  saveSyncCursor,
  saveSyncServerConfig,
} from '../services/sync/syncSettings'
import type { SyncConflictEntry } from '../services/sync/syncTypes'

beforeEach(() => {
  localStorage.clear()
})

const conflict = (id: string): SyncConflictEntry => ({
  entityType: 'contracts',
  id,
  resolvedAt: '2026-10-02T12:00:00.000Z',
  winner: 'server',
  losingVersion: { id, createdAt: '', updatedAt: '', deletedAt: null, syncVersion: 1 },
})

describe('sync settings', () => {
  it('uses the V1 placeholder owner until the device joined a household', () => {
    expect(getCurrentOwnerId()).toBe('local-user')
    saveHouseholdMembership({ householdId: 'hh-1', householdName: 'Zuhause' })
    expect(getCurrentOwnerId()).toBe('hh-1')
  })

  it('normalises the server url and keeps cursors per household', () => {
    saveSyncServerConfig({ url: ' https://abc.supabase.co/ ', anonKey: ' key ' })
    expect(getSyncServerConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: 'key' })
    saveSyncCursor('hh-1', 12)
    expect(getSyncCursor('hh-1')).toBe(12)
    expect(getSyncCursor('hh-2')).toBe(0)
  })

  it('keeps the conflict log newest first and capped at 50 entries', () => {
    appendConflictLog(Array.from({ length: 40 }, (_, i) => conflict(`a${i}`)))
    appendConflictLog(Array.from({ length: 20 }, (_, i) => conflict(`b${i}`)))
    const log = getConflictLog()
    expect(log).toHaveLength(50)
    expect(log[0]?.id).toBe('b19')
  })

  it('skips syncing entirely while no server is configured', async () => {
    expect(await runSync()).toEqual({ kind: 'skipped', reason: 'not_configured' })
  })
})

describe('describeSyncError', () => {
  it('maps known server and network errors to German messages', () => {
    expect(describeSyncError({ message: 'invalid_invite' })).toContain('Einladungscode')
    expect(describeSyncError(new TypeError('Failed to fetch'))).toContain('Internetverbindung')
    expect(describeSyncError(new Error('Token has expired or is invalid'))).toContain('Code')
    expect(describeSyncError(new Error('something odd'))).toContain('bleiben unverändert')
  })
})

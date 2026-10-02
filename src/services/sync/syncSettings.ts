import { DEFAULT_USER_ID } from '../../constants/user'
import type { SyncConflictEntry } from './syncTypes'

/**
 * Device-local sync settings, kept in localStorage (same reasoning as
 * reminderSettings.ts: small device configuration, not domain data, and no
 * IndexedDB schema/version change - which would also make older backups
 * unrestorable). Every accessor tolerates a missing/blocked localStorage.
 */

const KEYS = {
  config: 'kostenblick.sync.config.v1',
  household: 'kostenblick.sync.household.v1',
  cursorPrefix: 'kostenblick.sync.cursor.v1.',
  status: 'kostenblick.sync.status.v1',
  conflicts: 'kostenblick.sync.conflicts.v1',
} as const

const MAX_CONFLICT_LOG = 50

export interface SyncServerConfig {
  url: string
  anonKey: string
}

export interface HouseholdMembership {
  householdId: string
  householdName: string
}

export interface SyncStatus {
  lastSyncAt?: string
  lastError?: string
  lastPushed?: number
  lastPulled?: number
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable - sync simply stays unconfigured.
  }
}

function envConfig(): SyncServerConfig | undefined {
  const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && anonKey ? { url, anonKey } : undefined
}

/** Server connection: entered by the user in Settings, or (fallback)
 * provided at build time via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 * The anon key is public by design - access control lives in the
 * database's Row Level Security, never in the client. */
export function getSyncServerConfig(): SyncServerConfig | undefined {
  const stored = read<SyncServerConfig>(KEYS.config)
  if (stored?.url && stored.anonKey) return stored
  return envConfig()
}

export function saveSyncServerConfig(config: SyncServerConfig | undefined): void {
  write(KEYS.config, config ? { url: config.url.trim().replace(/\/+$/, ''), anonKey: config.anonKey.trim() } : undefined)
}

export function getHouseholdMembership(): HouseholdMembership | undefined {
  const value = read<HouseholdMembership>(KEYS.household)
  return value?.householdId ? value : undefined
}

export function saveHouseholdMembership(membership: HouseholdMembership | undefined): void {
  write(KEYS.household, membership)
}

/** Owner id written into new entities' `userId`: the household once this
 * device has joined one, otherwise the V1 single-user placeholder. */
export function getCurrentOwnerId(): string {
  return getHouseholdMembership()?.householdId ?? DEFAULT_USER_ID
}

export function getSyncCursor(householdId: string): number {
  const value = read<number>(KEYS.cursorPrefix + householdId)
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function saveSyncCursor(householdId: string, cursor: number): void {
  write(KEYS.cursorPrefix + householdId, cursor)
}

export function resetSyncCursor(householdId: string): void {
  write(KEYS.cursorPrefix + householdId, undefined)
}

export function getSyncStatus(): SyncStatus {
  return read<SyncStatus>(KEYS.status) ?? {}
}

export function saveSyncStatus(status: SyncStatus): void {
  write(KEYS.status, status)
}

export function getConflictLog(): SyncConflictEntry[] {
  const value = read<SyncConflictEntry[]>(KEYS.conflicts)
  return Array.isArray(value) ? value : []
}

/** Newest first, capped so the log can never grow without bound. */
export function appendConflictLog(entries: SyncConflictEntry[]): void {
  if (entries.length === 0) return
  write(KEYS.conflicts, [...[...entries].reverse(),...getConflictLog()].slice(0, MAX_CONFLICT_LOG))
}

export function clearConflictLog(): void {
  write(KEYS.conflicts, undefined)
}

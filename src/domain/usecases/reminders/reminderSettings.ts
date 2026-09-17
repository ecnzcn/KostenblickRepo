import { DEFAULT_REMINDER_OFFSET_DAYS } from './calculateReminderDates'

const STORAGE_KEY = 'kostenblick.reminderIntervals.v1'

export type ReminderIntervalSettings = Record<number, boolean>

function defaultSettings(): ReminderIntervalSettings {
  return Object.fromEntries(DEFAULT_REMINDER_OFFSET_DAYS.map((offsetDays) => [offsetDays, true]))
}

/**
 * Which of the standard reminder intervals (90/30/7/1 days) the user
 * wants generated, persisted in localStorage rather than IndexedDB - this
 * is a handful of booleans, not domain data that needs sync/versioning,
 * so a dedicated IndexedDB object store (and the schema migration that
 * would require) would be unjustified overhead for Phase 6. Falls back to
 * "all enabled" whenever localStorage is unavailable or empty, so contract
 * reminders keep working even in private browsing / storage-restricted
 * contexts.
 */
export function getReminderIntervalSettings(): ReminderIntervalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<Record<number, unknown>>
    const merged = defaultSettings()
    for (const offsetDays of DEFAULT_REMINDER_OFFSET_DAYS) {
      if (typeof parsed[offsetDays] === 'boolean') merged[offsetDays] = parsed[offsetDays]
    }
    return merged
  } catch {
    return defaultSettings()
  }
}

export function saveReminderIntervalSettings(settings: ReminderIntervalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage unavailable (private mode, quota exceeded, …) - the
    // setting simply won't persist across reloads; nothing to surface to
    // the user mid-toggle.
  }
}

/** The offsets (a subset of DEFAULT_REMINDER_OFFSET_DAYS) currently
 * enabled, in the order generateContractReminders should use them. */
export function getEnabledReminderOffsets(): number[] {
  const settings = getReminderIntervalSettings()
  return DEFAULT_REMINDER_OFFSET_DAYS.filter((offsetDays) => settings[offsetDays] !== false)
}

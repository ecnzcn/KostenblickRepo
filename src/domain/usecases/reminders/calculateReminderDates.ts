import type { ISODateString } from '../../models/entities'

/** Standard reminder lead times before a contract's cancellation deadline,
 * configurable per-user in Settings (see reminderSettings.ts) but never
 * hardcoded a second time anywhere else. */
export const DEFAULT_REMINDER_OFFSET_DAYS = [90, 30, 7, 1] as const

export interface ReminderDateEntry {
  offsetDays: number
  reminderDate: ISODateString
}

/**
 * One reminder date per offset, that many days before `targetDate` - plain
 * day-based subtraction (not the month-clamped arithmetic
 * calculateCancellationDate uses), since these offsets are always given in
 * days. Uses UTC date parts so results don't depend on the host's local
 * timezone. Sorted chronologically ascending (earliest reminder first).
 */
export function calculateReminderDates(
  targetDate: ISODateString,
  offsets: readonly number[] = DEFAULT_REMINDER_OFFSET_DAYS,
): ReminderDateEntry[] {
  return offsets
    .map((offsetDays) => {
      const date = new Date(targetDate)
      date.setUTCDate(date.getUTCDate() - offsetDays)
      return { offsetDays, reminderDate: date.toISOString() }
    })
    .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime())
}

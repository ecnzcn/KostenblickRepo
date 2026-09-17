import { describe, expect, it } from 'vitest'
import { calculateReminderDates } from '../domain/usecases/reminders/calculateReminderDates'

describe('calculateReminderDates', () => {
  it('computes the standard 90/30/7/1-day reminders before a cancellation date', () => {
    const result = calculateReminderDates('2026-09-30T00:00:00.000Z')
    expect(result.map((entry) => entry.reminderDate.slice(0, 10))).toEqual([
      '2026-07-02',
      '2026-08-31',
      '2026-09-23',
      '2026-09-29',
    ])
    expect(result.map((entry) => entry.offsetDays)).toEqual([90, 30, 7, 1])
  })

  it('sorts results chronologically regardless of input offset order', () => {
    const result = calculateReminderDates('2026-09-30T00:00:00.000Z', [1, 90, 7, 30])
    expect(result.map((entry) => entry.offsetDays)).toEqual([90, 30, 7, 1])
  })

  it('respects a custom, reduced set of offsets (disabled intervals)', () => {
    const result = calculateReminderDates('2026-09-30T00:00:00.000Z', [30, 1])
    expect(result.map((entry) => entry.offsetDays)).toEqual([30, 1])
  })

  it('handles a year rollover (offset crosses into the previous year)', () => {
    const result = calculateReminderDates('2027-01-15T00:00:00.000Z', [90])
    expect(result[0]?.reminderDate.slice(0, 10)).toBe('2026-10-17')
  })
})

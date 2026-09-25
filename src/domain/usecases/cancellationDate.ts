import type { CancellationUnit, ISODateString } from '../models/entities'

function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of the *next* month is the last day of monthIndex.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Subtracts whole months from a date, clamping the day-of-month to the
 * last valid day of the resulting month instead of letting it overflow
 * (e.g. 31.12 minus 3 months must land on 30.09, not roll over to 01.10
 * the way `Date.setUTCMonth` does when the target month is shorter).
 *
 * If the original date was itself the last day of its month (e.g. 30.11,
 * the last day of November), the result must likewise land on the last
 * day of the target month (31.10) - not on the same day-of-month number
 * (30.10) - since "end of month" is what a calendar-day count of the
 * source month's own length actually means.
 */
function subtractMonthsClamped(date: Date, months: number): void {
  const originalDay = date.getUTCDate()
  const wasEndOfMonth = originalDay === daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  const targetMonthLength = daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
  date.setUTCDate(wasEndOfMonth ? targetMonthLength : Math.min(originalDay, targetMonthLength))
}

/**
 * Kündigungstermin = Vertragsende - Kündigungsfrist.
 * Uses UTC date parts throughout so day/week/month/year arithmetic is not
 * affected by the host's local timezone or DST transitions.
 */
export function calculateCancellationDate(
  endDate: ISODateString,
  cancellationPeriodValue: number,
  cancellationPeriodUnit: CancellationUnit,
): ISODateString {
  const date = new Date(endDate)

  switch (cancellationPeriodUnit) {
    case 'days':
      date.setUTCDate(date.getUTCDate() - cancellationPeriodValue)
      break
    case 'weeks':
      date.setUTCDate(date.getUTCDate() - cancellationPeriodValue * 7)
      break
    case 'months':
      subtractMonthsClamped(date, cancellationPeriodValue)
      break
    case 'years':
      subtractMonthsClamped(date, cancellationPeriodValue * 12)
      break
  }

  return date.toISOString()
}

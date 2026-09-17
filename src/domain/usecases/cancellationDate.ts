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
 */
function subtractMonthsClamped(date: Date, months: number): void {
  const originalDay = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - months)
  date.setUTCDate(Math.min(originalDay, daysInMonth(date.getUTCFullYear(), date.getUTCMonth())))
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

import type { CancellationUnit, ISODateString } from '../models/entities'

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
      date.setUTCMonth(date.getUTCMonth() - cancellationPeriodValue)
      break
    case 'years':
      date.setUTCFullYear(date.getUTCFullYear() - cancellationPeriodValue)
      break
  }

  return date.toISOString()
}

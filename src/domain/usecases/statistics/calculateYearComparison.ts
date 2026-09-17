import { roundToCents } from '../../../utils/money'
import { calculatePercentageChange } from '../percentageChange'

export interface YearOverYearChange {
  /** undefined when there is no previous-year amount to compare against. */
  change: number | undefined
  /** undefined = no previous year; null = previous year is 0 (no valid
   * percentage base). */
  percent: number | null | undefined
}

/**
 * `difference = current - previous`; `percentage = previous !== 0 ?
 * difference/previous*100 : null`. Reuses the existing, already-tested
 * `calculatePercentageChange` (oldValue===0 -> null) so the divide-by-zero
 * handling isn't duplicated.
 */
export function calculateYearOverYearChange(
  currentAmount: number,
  previousAmount: number | undefined,
): YearOverYearChange {
  if (previousAmount === undefined) return { change: undefined, percent: undefined }
  return {
    change: roundToCents(currentAmount - previousAmount),
    percent: calculatePercentageChange(previousAmount, currentAmount),
  }
}

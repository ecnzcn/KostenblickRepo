/** Total cost of one year, used for the multi-year comparison chart. */
export interface YearStatistic {
  year: number
  amount: number
}

/**
 * Statistics for a single selected year.
 *
 * `totalAmount` is the sole source of truth for "what this year cost" -
 * the sum of `Bill.totalAmount` across the year's bills, never added to
 * `itemizedAmount` (see CLAUDE.md, "No double counting"). `itemizedAmount`
 * is the sum of the same bills' BillItems, used only for the category/
 * position breakdown. `unassignedDifference` (`totalAmount - itemizedAmount`)
 * is surfaced transparently instead of silently reconciled - it can be
 * positive (a bill's total includes costs no item breaks out) or negative
 * (item amounts exceed the bill's stated total, a data-quality anomaly).
 */
export interface StatisticsSummary {
  year: number
  totalAmount: number
  itemizedAmount: number
  unassignedDifference: number
  billCount: number
  /** undefined = no data at all for the previous year (no comparison
   * possible); a real number (incl. 0) = the previous year has data. */
  previousYearAmount?: number
  yearOverYearChange?: number
  /** undefined = no previous year to compare against; null = previous
   * year exists but is 0 (no valid percentage base - never Infinity/NaN). */
  yearOverYearChangePercent?: number | null
}

export interface CategoryStatistic {
  /** undefined for the synthetic "Nicht zugeordnet" bucket (BillItems
   * without a categoryId). */
  categoryId?: string
  categoryName: string
  categoryIcon: string
  amount: number
  percentage: number
}

/** A single cost position (BillItem), not a category aggregate - kept as
 * its own type per the spec rather than reusing CategoryStatistic, since a
 * position also needs its own description (e.g. "Heizkosten" vs.
 * "Heizungswartung" can both be category "heating" but are different
 * positions). */
export interface TopCostPosition {
  categoryId?: string
  categoryName: string
  description: string
  amount: number
  percentage: number
}

export interface MonthlyStatistic {
  /** 'YYYY-MM' */
  month: string
  amount: number
  /** false = no bill could be genuinely attributed to this month; the
   * month is a placeholder, its amount is always 0, and the UI must never
   * treat it as real data (no even distribution of annual bills). */
  hasActualData: boolean
}

export interface BillItemsDiscrepancy {
  billId: string
  billTotal: number
  itemsTotal: number
  difference: number
}

export interface StatisticsData {
  /** All years with at least one bill, ascending. Empty = no data at all. */
  years: number[]
  yearStatistics: YearStatistic[]
  summary: StatisticsSummary
  categories: CategoryStatistic[]
  topCostPositions: TopCostPosition[]
  monthlyStatistics: MonthlyStatistic[]
  /** true when at least one month in `monthlyStatistics` has real data. */
  hasMonthlyData: boolean
  /** Average of only the months with `hasActualData`; undefined when none
   * have real data (never a blind yearTotal/12). */
  averageMonthlyCost?: number
}

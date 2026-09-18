import { BILL_TYPE_LABELS } from './bills'
import { WASTE_CATEGORY_LABELS } from '../../constants/waste'
import { roundToCents } from '../../utils/money'
import type { Bill, BillItem, Category, CostEntry, WasteCategory, WasteCost } from '../models/entities'
import {
  billItemRepository,
  billRepository,
  costEntryRepository,
  wasteCostRepository,
} from '../repositories/indexedDbRepositories'
import { categoryRepository } from '../repositories/categories'
import { UNASSIGNED_CATEGORY_NAME } from './statistics/calculateCategoryStatistics'
import { calculateAverageMonthlyCost, calculateMonthlyStatistics } from './statistics/calculateMonthlyStatistics'
import type { MonthlyStatistic } from './statistics/statisticsTypes'

/**
 * The central cost projection is a READ MODEL, computed at request time from
 * the existing entities - it never persists anything of its own (no new
 * IndexedDB store, no DATABASE_VERSION change). Bill, WasteCost and
 * CostEntry remain each their own Source of Truth; this module only
 * combines them for the /kostenuebersicht page and (per Phase 9 scope) the
 * Dashboard's headline cost cards. Contract is deliberately never read here
 * - monthlyCost/yearlyCost are contractual/planned figures, not money that
 * has actually been spent (see CLAUDE.md, "Zentrale Kostenübersicht").
 */

export type CentralCostSource = 'bill' | 'waste' | 'manual'

/** The central Category id that WasteCost amounts are reported under - it
 * is the pre-existing, seeded `{ id: 'waste', name: 'Müll' }` Category
 * (src/constants/categories.ts), not a new synthetic bucket. The original,
 * more granular `WasteCategory` (residual/organic/…) is preserved on the
 * item itself (`wasteCategory`) rather than discarded. */
export const CENTRAL_WASTE_CATEGORY_ID = 'waste'

export interface CentralCostItem {
  id: string
  source: CentralCostSource
  amount: number
  year: number
  /** Only set for source: 'manual' (CostEntry.date). */
  date?: string
  /** Only set for source: 'bill' (Bill.periodStart/periodEnd). */
  periodStart?: string
  periodEnd?: string
  /** Central Category id. Never set for 'bill' items - a Bill has no
   * single category of its own, only its BillItems do (see
   * getCentralCostsByCategory, which reads BillItems directly instead of
   * inventing a category for the Bill as a whole). Always
   * CENTRAL_WASTE_CATEGORY_ID for 'waste' items. */
  categoryId?: string
  /** Only set for source: 'waste' - the original, more granular waste
   * category, kept alongside the central `categoryId` mapping. */
  wasteCategory?: WasteCategory
  description: string
  /** id of the underlying Bill / WasteCost / CostEntry. */
  sourceEntityId: string
  /** Always false today - Bill/WasteCost/CostEntry amounts are all
   * recorded, real figures. Reserved for a future phase that might add
   * Contract-derived, explicitly-estimated items to this projection. */
  isEstimate: boolean
}

export type CostAggregationWarningType = 'possible_duplicate_waste' | 'possible_duplicate_manual_entry'

export interface CostAggregationWarning {
  type: CostAggregationWarningType
  year: number
  description: string
}

export interface CentralCostSourceBreakdown {
  source: CentralCostSource
  amount: number
  count: number
}

export interface CentralCostCategoryBreakdown {
  /** undefined for the synthetic "Nicht zugeordnet" bucket. */
  categoryId?: string
  categoryName: string
  categoryIcon: string
  amount: number
  percentage: number
}

export interface CentralCostSummary {
  year: number
  /** billAmount + wasteAmount + manualAmount. */
  totalAmount: number
  billAmount: number
  wasteAmount: number
  manualAmount: number
  /** Sum of the 12 monthly entries - only the portion of totalAmount that
   * could actually be attributed to a specific month (see
   * getCentralCostsByMonth). */
  monthlyAttributedTotal: number
  /** totalAmount - monthlyAttributedTotal: WasteCost (no month granularity
   * at all) plus any Bill that isn't attributable to a single month (e.g.
   * an annual statement) always end up here - never guessed at or spread
   * evenly across months. */
  unallocatedForMonthView: number
  monthlyAverage?: number
  monthlyDataAvailable: boolean
  /** Number of distinct overlap warnings detected for this year - not a
   * count of individual line items, since which specific items overlap is
   * exactly what cannot be determined without heuristic guessing (see
   * detectCostAggregationWarnings). */
  possibleDuplicateCount: number
  warnings: CostAggregationWarning[]
}

export interface CentralCostData {
  year: number
  /** Every year with at least one Bill, WasteCost or CostEntry, ascending. */
  years: number[]
  summary: CentralCostSummary
  items: CentralCostItem[]
  monthly: MonthlyStatistic[]
  categories: CentralCostCategoryBreakdown[]
  sourceBreakdown: CentralCostSourceBreakdown[]
  warnings: CostAggregationWarning[]
}

function isInYear(entry: CostEntry, year: number): boolean {
  const date = new Date(entry.date)
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year
}

function monthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
}

/**
 * Maps every Bill, WasteCost and non-Bill-linked CostEntry to one
 * CentralCostItem each, across all years - the shared basis every other
 * function in this module derives its view from.
 *
 * A Bill contributes exactly one item at `Bill.totalAmount` (never its
 * BillItems - see CLAUDE.md, "No double counting"). A CostEntry with
 * `billId` already set is treated as already represented by that Bill and
 * is deliberately excluded here rather than counted a second time; no
 * heuristic matching by amount/date/description is attempted for entries
 * without a billId (see CLAUDE.md, "CostEntry-Deduplizierung").
 */
export function buildCentralCostItems(
  bills: Bill[],
  wasteCosts: WasteCost[],
  costEntries: CostEntry[],
): CentralCostItem[] {
  const billItems: CentralCostItem[] = bills.map((bill) => ({
    id: `bill:${bill.id}`,
    source: 'bill',
    amount: bill.totalAmount,
    year: bill.year,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    description: `${BILL_TYPE_LABELS[bill.type]} ${bill.year}`,
    sourceEntityId: bill.id,
    isEstimate: false,
  }))

  const wasteItems: CentralCostItem[] = wasteCosts.map((entry) => ({
    id: `waste:${entry.id}`,
    source: 'waste',
    amount: entry.amount,
    year: entry.year,
    categoryId: CENTRAL_WASTE_CATEGORY_ID,
    wasteCategory: entry.category,
    description: WASTE_CATEGORY_LABELS[entry.category],
    sourceEntityId: entry.id,
    isEstimate: false,
  }))

  const manualItems: CentralCostItem[] = costEntries
    .filter((entry) => entry.billId === undefined)
    .map((entry) => ({
      id: `manual:${entry.id}`,
      source: 'manual',
      amount: entry.amount,
      year: new Date(entry.date).getUTCFullYear(),
      date: entry.date,
      categoryId: entry.categoryId,
      description: entry.notes || 'Manuell erfasste Kosten',
      sourceEntityId: entry.id,
      isEstimate: false,
    }))

  return [...billItems, ...wasteItems, ...manualItems]
}

export function getCentralCostsByYear(items: CentralCostItem[], year: number): CentralCostItem[] {
  return items.filter((item) => item.year === year)
}

/** Every year with at least one Bill, WasteCost or CostEntry, ascending -
 * the basis for the year selector on /kostenuebersicht. */
export function getCentralCostYears(bills: Bill[], wasteCosts: WasteCost[], costEntries: CostEntry[]): number[] {
  const years = new Set<number>()
  for (const bill of bills) years.add(bill.year)
  for (const entry of wasteCosts) years.add(entry.year)
  for (const entry of costEntries) {
    const date = new Date(entry.date)
    if (!Number.isNaN(date.getTime())) years.add(date.getUTCFullYear())
  }
  return [...years].sort((a, b) => a - b)
}

/**
 * Monthly view for one year, source-aware:
 * - Bill: reuses the existing, tested `calculateMonthlyStatistics` - a Bill
 *   is only attributed to a month when its period is fully and
 *   unambiguously within that one month (never spread evenly).
 * - CostEntry: attributed via its own `date`, excluding Bill-linked entries
 *   (see buildCentralCostItems).
 * - WasteCost: never contributes here at all - it only has a `year`, no
 *   month-level granularity, so it is never guessed at (see
 *   CentralCostSummary.unallocatedForMonthView for where it ends up instead).
 */
export function getCentralCostsByMonth(bills: Bill[], costEntries: CostEntry[], year: number): MonthlyStatistic[] {
  const billMonthly = calculateMonthlyStatistics(bills, year)

  const manualMonthly = new Map<string, number>()
  for (const entry of costEntries) {
    if (entry.billId !== undefined) continue
    if (!isInYear(entry, year)) continue
    const date = new Date(entry.date)
    const key = monthKey(year, date.getUTCMonth())
    manualMonthly.set(key, roundToCents((manualMonthly.get(key) ?? 0) + entry.amount))
  }

  return billMonthly.map((entry) => {
    const manualAmount = manualMonthly.get(entry.month) ?? 0
    return {
      month: entry.month,
      amount: roundToCents(entry.amount + manualAmount),
      hasActualData: entry.hasActualData || manualAmount > 0,
    }
  })
}

/**
 * Category breakdown for one year, combining:
 * - BillItem amounts (itemized, NOT Bill.totalAmount - the same
 *   itemized-vs-total distinction the Statistics feature already makes;
 *   see calculateStatisticsSummary) for Bills in that year,
 * - WasteCost amounts, bucketed under the central `waste` category,
 * - non-Bill-linked CostEntry amounts, under their own categoryId.
 *
 * Because BillItems and Bill.totalAmount can differ (an un-itemized
 * portion of a bill), the sum of this breakdown can be lower than
 * CentralCostSummary.totalAmount - the same transparent discrepancy the
 * Statistics page already surfaces via BillDiscrepancyNotice, not silently
 * reconciled here either.
 */
export function getCentralCostsByCategory(
  bills: Bill[],
  billItems: BillItem[],
  wasteCosts: WasteCost[],
  costEntries: CostEntry[],
  categories: Category[],
  year: number,
): CentralCostCategoryBreakdown[] {
  const UNASSIGNED_KEY = '__unassigned__'
  const yearBillIds = new Set(bills.filter((bill) => bill.year === year).map((bill) => bill.id))
  const yearBillItems = billItems.filter((item) => yearBillIds.has(item.billId))
  const yearWaste = wasteCosts.filter((entry) => entry.year === year)
  const yearManual = costEntries.filter((entry) => entry.billId === undefined && isInYear(entry, year))

  const totals = new Map<string, number>()
  for (const item of yearBillItems) {
    const key = item.categoryId ?? UNASSIGNED_KEY
    totals.set(key, roundToCents((totals.get(key) ?? 0) + item.amount))
  }
  for (const entry of yearWaste) {
    totals.set(
      CENTRAL_WASTE_CATEGORY_ID,
      roundToCents((totals.get(CENTRAL_WASTE_CATEGORY_ID) ?? 0) + entry.amount),
    )
  }
  for (const entry of yearManual) {
    const key = entry.categoryId || UNASSIGNED_KEY
    totals.set(key, roundToCents((totals.get(key) ?? 0) + entry.amount))
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)

  return [...totals.entries()]
    .map(([key, amount]) => {
      const isUnassigned = key === UNASSIGNED_KEY
      const category = isUnassigned ? undefined : categoriesById.get(key)
      return {
        categoryId: isUnassigned ? undefined : key,
        categoryName: isUnassigned ? UNASSIGNED_CATEGORY_NAME : (category?.name ?? key),
        categoryIcon: isUnassigned ? '•' : (category?.icon ?? '•'),
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Detects (never silently resolves) a possible overlap between WasteCost
 * and waste-categorized costs recorded elsewhere for the same year - see
 * CLAUDE.md, "Doppelzählung". Nothing is deleted, merged or excluded from
 * any total because of a warning; the user is left to review and decide.
 *
 * The warning text deliberately never states a specific "duplicated"
 * amount: the data gives no reliable way to know whether the separate
 * WasteCost really is the same money as the waste-categorized BillItem/
 * CostEntry (as opposed to two genuinely independent waste costs in the
 * same year) - inventing a number here would be false precision.
 */
export function detectCostAggregationWarnings(
  bills: Bill[],
  billItems: BillItem[],
  wasteCosts: WasteCost[],
  costEntries: CostEntry[],
  year: number,
): CostAggregationWarning[] {
  const warnings: CostAggregationWarning[] = []
  const hasWasteCostForYear = wasteCosts.some((entry) => entry.year === year)
  if (!hasWasteCostForYear) return warnings

  const yearBillIds = new Set(bills.filter((bill) => bill.year === year).map((bill) => bill.id))
  const hasBillWasteItem = billItems.some(
    (item) => yearBillIds.has(item.billId) && item.categoryId === CENTRAL_WASTE_CATEGORY_ID,
  )
  if (hasBillWasteItem) {
    warnings.push({
      type: 'possible_duplicate_waste',
      year,
      description: `Möglicher Überschneidungsfall: Für ${year} wurden Müllkosten sowohl innerhalb einer Abrechnung als auch separat unter Müllkosten erfasst. Das kann, muss aber nicht dieselbe Kostenposition doppelt sein - bitte prüfen Sie, ob dieselbe Ausgabe bereits an anderer Stelle berücksichtigt wurde.`,
    })
  }

  const hasManualWasteEntry = costEntries.some(
    (entry) => entry.billId === undefined && entry.categoryId === CENTRAL_WASTE_CATEGORY_ID && isInYear(entry, year),
  )
  if (hasManualWasteEntry) {
    warnings.push({
      type: 'possible_duplicate_manual_entry',
      year,
      description: `Möglicher Überschneidungsfall: Für ${year} wurden Müllkosten sowohl manuell erfasst als auch separat unter Müllkosten erfasst. Das kann, muss aber nicht dieselbe Kostenposition doppelt sein - bitte prüfen Sie, ob dieselbe Ausgabe bereits an anderer Stelle berücksichtigt wurde.`,
    })
  }

  return warnings
}

/** Aggregates the year's already-built items/monthly view/warnings into
 * one summary - Contract never enters this at any point (see module
 * comment above). */
export function getCentralCostSummary(
  items: CentralCostItem[],
  monthly: MonthlyStatistic[],
  warnings: CostAggregationWarning[],
  year: number,
): CentralCostSummary {
  const yearItems = getCentralCostsByYear(items, year)
  const amountBySource = (source: CentralCostSource) =>
    roundToCents(yearItems.filter((item) => item.source === source).reduce((sum, item) => sum + item.amount, 0))

  const billAmount = amountBySource('bill')
  const wasteAmount = amountBySource('waste')
  const manualAmount = amountBySource('manual')
  const totalAmount = roundToCents(billAmount + wasteAmount + manualAmount)
  const monthlyAttributedTotal = roundToCents(monthly.reduce((sum, entry) => sum + entry.amount, 0))

  return {
    year,
    totalAmount,
    billAmount,
    wasteAmount,
    manualAmount,
    monthlyAttributedTotal,
    unallocatedForMonthView: roundToCents(totalAmount - monthlyAttributedTotal),
    monthlyAverage: calculateAverageMonthlyCost(monthly),
    monthlyDataAvailable: monthly.some((entry) => entry.hasActualData),
    possibleDuplicateCount: warnings.length,
    warnings,
  }
}

/** Assembles the full central cost picture for one year from
 * already-fetched Bills/BillItems/WasteCosts/CostEntries/Categories - a
 * pure function, directly unit-testable without touching IndexedDB (same
 * pattern as buildStatisticsData). `getCentralCostData` below is the only
 * piece that talks to the repositories. */
export function buildCentralCostData(
  bills: Bill[],
  billItems: BillItem[],
  wasteCosts: WasteCost[],
  costEntries: CostEntry[],
  categories: Category[],
  year: number,
): CentralCostData {
  const years = getCentralCostYears(bills, wasteCosts, costEntries)
  const items = buildCentralCostItems(bills, wasteCosts, costEntries)
  const monthly = getCentralCostsByMonth(bills, costEntries, year)
  const categoryBreakdown = getCentralCostsByCategory(bills, billItems, wasteCosts, costEntries, categories, year)
  const warnings = detectCostAggregationWarnings(bills, billItems, wasteCosts, costEntries, year)
  const summary = getCentralCostSummary(items, monthly, warnings, year)

  const yearItems = getCentralCostsByYear(items, year)
  const countBySource = (source: CentralCostSource) => yearItems.filter((item) => item.source === source).length
  const sourceBreakdown: CentralCostSourceBreakdown[] = [
    { source: 'bill', amount: summary.billAmount, count: countBySource('bill') },
    { source: 'waste', amount: summary.wasteAmount, count: countBySource('waste') },
    { source: 'manual', amount: summary.manualAmount, count: countBySource('manual') },
  ]

  return {
    year,
    years,
    summary,
    items: yearItems,
    monthly,
    categories: categoryBreakdown,
    sourceBreakdown,
    warnings,
  }
}

/**
 * Loads Bills, BillItems, WasteCosts, CostEntries and Categories exactly
 * once and derives every central-cost view from that single fetch (no N+1
 * IndexedDB access per chart/card) - the only function here that touches
 * the repositories. `contractRepository` is intentionally never imported
 * in this module (see module comment).
 */
export async function getCentralCostData(year: number): Promise<CentralCostData> {
  const [bills, billItems, wasteCosts, costEntries, categories] = await Promise.all([
    billRepository.getAll(),
    billItemRepository.getAll(),
    wasteCostRepository.getAll(),
    costEntryRepository.getAll(),
    categoryRepository.getAll(),
  ])

  return buildCentralCostData(bills, billItems, wasteCosts, costEntries, categories, year)
}

/** All CentralCostItems across every year, unfiltered - a convenience for
 * a future consumer that needs the full unified list (e.g. export), kept
 * distinct from `getCentralCostData(year)` which is what the
 * /kostenuebersicht page and Dashboard actually use, since they need only
 * one year and should not load the full history on every render. */
export async function getCentralCosts(): Promise<CentralCostItem[]> {
  const [bills, wasteCosts, costEntries] = await Promise.all([
    billRepository.getAll(),
    wasteCostRepository.getAll(),
    costEntryRepository.getAll(),
  ])
  return buildCentralCostItems(bills, wasteCosts, costEntries)
}

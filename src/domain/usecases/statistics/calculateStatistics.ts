import type { Bill, BillItem, Category } from '../../models/entities'
import { roundToCents } from '../../../utils/money'
import { categoryRepository } from '../../repositories/categories'
import { billItemRepository, billRepository } from '../../repositories/indexedDbRepositories'
import { calculateAverageMonthlyCost, calculateMonthlyStatistics } from './calculateMonthlyStatistics'
import { calculateCategoryStatistics } from './calculateCategoryStatistics'
import { calculateTopCostPositions, DEFAULT_TOP_COST_POSITIONS_COUNT } from './calculateTopCostPositions'
import { calculateYearOverYearChange } from './calculateYearComparison'
import type { BillItemsDiscrepancy, StatisticsData, StatisticsSummary, YearStatistic } from './statisticsTypes'

/** All years with at least one bill, ascending - the basis for the year
 * selector and the multi-year comparison. */
export function getAvailableYears(bills: Bill[]): number[] {
  return [...new Set(bills.map((bill) => bill.year))].sort((a, b) => a - b)
}

/** Sum of Bill.totalAmount for one year - the single source of truth for
 * "what did this year cost", never summed together with BillItems (that
 * would double-count the same money twice; see CLAUDE.md). */
export function calculateYearlyTotal(bills: Bill[], year: number): number {
  return roundToCents(
    bills.filter((bill) => bill.year === year).reduce((sum, bill) => sum + bill.totalAmount, 0),
  )
}

/** One total per year that has at least one bill - the data for the
 * multi-year comparison chart. */
export function calculateYearStatistics(bills: Bill[]): YearStatistic[] {
  return getAvailableYears(bills).map((year) => ({ year, amount: calculateYearlyTotal(bills, year) }))
}

/** A single bill's total vs. the sum of its own items, surfaced rather
 * than silently reconciled (e.g. Bill=1.000€, Items=900€ -> difference
 * 100€ of costs the bill states but no item breaks out). */
export function detectBillItemsDiscrepancy(bill: Bill, items: BillItem[]): BillItemsDiscrepancy {
  const itemsTotal = roundToCents(items.reduce((sum, item) => sum + item.amount, 0))
  return {
    billId: bill.id,
    billTotal: bill.totalAmount,
    itemsTotal,
    difference: roundToCents(bill.totalAmount - itemsTotal),
  }
}

type BaseSummary = Omit<StatisticsSummary, 'previousYearAmount' | 'yearOverYearChange' | 'yearOverYearChangePercent'>

/** The core, non-double-counting summary for one year: totalAmount comes
 * exclusively from Bill.totalAmount; itemizedAmount is the same bills'
 * BillItems, used only for the category breakdown, never added to
 * totalAmount. */
export function calculateStatisticsSummary(bills: Bill[], billItems: BillItem[], year: number): BaseSummary {
  const yearBills = bills.filter((bill) => bill.year === year)
  const totalAmount = calculateYearlyTotal(bills, year)
  const yearBillIds = new Set(yearBills.map((bill) => bill.id))
  const yearItems = billItems.filter((item) => yearBillIds.has(item.billId))
  const itemizedAmount = roundToCents(yearItems.reduce((sum, item) => sum + item.amount, 0))

  return {
    year,
    totalAmount,
    itemizedAmount,
    unassignedDifference: roundToCents(totalAmount - itemizedAmount),
    billCount: yearBills.length,
  }
}

function billItemsForYear(bills: Bill[], billItems: BillItem[], year: number): BillItem[] {
  const yearBillIds = new Set(bills.filter((bill) => bill.year === year).map((bill) => bill.id))
  return billItems.filter((item) => yearBillIds.has(item.billId))
}

/** Assembles the full statistics picture for one selected year from
 * already-fetched Bills/BillItems/Categories - a pure function, so it's
 * directly unit-testable without touching IndexedDB. `getStatisticsData`
 * below is the only piece that talks to the repositories. */
export function buildStatisticsData(
  bills: Bill[],
  billItems: BillItem[],
  categories: Category[],
  year: number,
  topCount: number = DEFAULT_TOP_COST_POSITIONS_COUNT,
): StatisticsData {
  const years = getAvailableYears(bills)
  const yearStatistics = calculateYearStatistics(bills)
  const yearItems = billItemsForYear(bills, billItems, year)

  const baseSummary = calculateStatisticsSummary(bills, billItems, year)
  const previousYearAmount = yearStatistics.find((stat) => stat.year === year - 1)?.amount
  const { change, percent } = calculateYearOverYearChange(baseSummary.totalAmount, previousYearAmount)

  const summary: StatisticsSummary = {
    ...baseSummary,
    previousYearAmount,
    yearOverYearChange: change,
    yearOverYearChangePercent: percent,
  }

  const monthlyStatistics = calculateMonthlyStatistics(bills, year)

  return {
    years,
    yearStatistics,
    summary,
    categories: calculateCategoryStatistics(yearItems, categories),
    topCostPositions: calculateTopCostPositions(yearItems, categories, topCount),
    monthlyStatistics,
    hasMonthlyData: monthlyStatistics.some((entry) => entry.hasActualData),
    averageMonthlyCost: calculateAverageMonthlyCost(monthlyStatistics),
  }
}

/**
 * Loads Bills, BillItems and Categories exactly once and derives every
 * statistics view from that single fetch (no N+1 IndexedDB access, no
 * separate load per chart/card). Reads Bills/BillItems directly rather
 * than the Dashboard's CostEntry-based pipeline - see CLAUDE.md
 * "Statistik-Architektur" for why.
 */
export async function getStatisticsData(year: number, topCount = DEFAULT_TOP_COST_POSITIONS_COUNT): Promise<StatisticsData> {
  const [bills, billItems, categories] = await Promise.all([
    billRepository.getAll(),
    billItemRepository.getAll(),
    categoryRepository.getAll(),
  ])

  return buildStatisticsData(bills, billItems, categories, year, topCount)
}

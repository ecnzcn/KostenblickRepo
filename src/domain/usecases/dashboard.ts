import { categoryRepository } from '../repositories/categories'
import {
  billItemRepository,
  billRepository,
  contractRepository,
  costEntryRepository,
  documentRepository,
  userRepository,
  wasteCostRepository,
} from '../repositories/indexedDbRepositories'
import type { BalanceType, Bill, Category, Contract, CostEntry, Document } from '../models/entities'
import { BILL_TYPE_LABELS } from './bills'
import {
  buildCentralCostItems,
  type CostAggregationWarning,
  detectCostAggregationWarnings,
  getCentralCostsByCategory,
  getCentralCostsByMonth,
  getCentralCostsByYear,
  getCentralCostSummary,
} from './centralCosts'
import { calculatePercentageChange } from './percentageChange'
import type { MonthlyStatistic } from './statistics/statisticsTypes'
import { getWasteCostSummary, type WasteCostYearSummary } from './wasteCosts'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_UPCOMING_CONTRACTS_LIMIT = 5

export interface MonthlyCost {
  /** 'YYYY-MM' */
  month: string
  amount: number
}

export interface CategoryCost {
  categoryId: string
  categoryName: string
  categoryIcon: string
  amount: number
}

export interface ContractDeadline {
  contractId: string
  categoryName: string
  provider: string
  cancellationDate: string
  daysRemaining: number
}

export interface BillSummary {
  billId: string
  title: string
  totalAmount: number
  balance: number
  balanceType: BalanceType
  importedAt: string
}

export interface DocumentsSummary {
  total: number
  needsReview: number
}

export interface DashboardData {
  userDisplayName?: string
  currentMonthCost: number
  previousMonthCost: number
  currentMonthChangePercent: number | null
  currentYearCost: number
  previousYearCost?: number
  currentYearChangePercent: number | null
  monthlyCosts: MonthlyCost[]
  categoryCosts: CategoryCost[]
  upcomingContracts: ContractDeadline[]
  latestBill?: BillSummary
  documentsSummary: DocumentsSummary
  wasteCostsSummary: WasteCostYearSummary
  /** Possible overlaps between WasteCost and waste-categorized Bill/
   * CostEntry amounts for the current year (see centralCosts.ts,
   * detectCostAggregationWarnings) - reused as-is, not reimplemented, so
   * the Dashboard's headline numbers and /kostenuebersicht never disagree
   * on whether a possible duplicate exists. Empty when nothing is flagged. */
  currentYearWarnings: CostAggregationWarning[]
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function isInMonth(entry: CostEntry, year: number, month: number): boolean {
  const date = new Date(entry.date)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month
}

function isInYear(entry: CostEntry, year: number): boolean {
  return new Date(entry.date).getUTCFullYear() === year
}

function sumAmounts(entries: CostEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0)
}

export function getMonthlyCosts(entries: CostEntry[], referenceDate: Date): MonthlyCost[] {
  const year = referenceDate.getUTCFullYear()
  const uptoMonth = referenceDate.getUTCMonth()
  const months: MonthlyCost[] = []
  for (let month = 0; month <= uptoMonth; month++) {
    months.push({
      month: monthKey(year, month),
      amount: sumAmounts(entries.filter((entry) => isInMonth(entry, year, month))),
    })
  }
  return months
}

export function getYearlyCosts(entries: CostEntry[], year: number): number {
  return sumAmounts(entries.filter((entry) => isInYear(entry, year)))
}

export function getCostsByCategory(
  entries: CostEntry[],
  categories: Category[],
  year: number,
): CategoryCost[] {
  const totalsByCategory = new Map<string, number>()
  for (const entry of entries) {
    if (!isInYear(entry, year)) continue
    totalsByCategory.set(entry.categoryId, (totalsByCategory.get(entry.categoryId) ?? 0) + entry.amount)
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  return [...totalsByCategory.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: categoriesById.get(categoryId)?.name ?? categoryId,
      categoryIcon: categoriesById.get(categoryId)?.icon ?? '•',
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function getUpcomingContractDeadlines(
  contracts: Contract[],
  categories: Category[],
  referenceDate: Date,
  limit = DEFAULT_UPCOMING_CONTRACTS_LIMIT,
): ContractDeadline[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const startOfToday = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  )

  return contracts
    .filter((contract): contract is Contract & { calculatedCancellationDate: string } =>
      Boolean(contract.calculatedCancellationDate),
    )
    .filter((contract) => new Date(contract.calculatedCancellationDate).getTime() >= startOfToday)
    .map((contract) => {
      const deadlineTime = new Date(contract.calculatedCancellationDate).getTime()
      return {
        contractId: contract.id,
        categoryName: categoriesById.get(contract.categoryId)?.name ?? contract.provider,
        provider: contract.provider,
        cancellationDate: contract.calculatedCancellationDate,
        daysRemaining: Math.ceil((deadlineTime - startOfToday) / MS_PER_DAY),
      }
    })
    .sort((a, b) => new Date(a.cancellationDate).getTime() - new Date(b.cancellationDate).getTime())
    .slice(0, limit)
}

export function getLatestBill(bills: Bill[]): BillSummary | undefined {
  if (bills.length === 0) return undefined

  const latest = [...bills].sort((a, b) => {
    const aDate = a.periodEnd ?? a.createdAt
    const bDate = b.periodEnd ?? b.createdAt
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })[0]

  if (!latest) return undefined

  return {
    billId: latest.id,
    title: `${BILL_TYPE_LABELS[latest.type]} ${latest.year}`,
    totalAmount: latest.totalAmount,
    balance: latest.balance,
    balanceType: latest.balanceType,
    importedAt: latest.createdAt,
  }
}

export function getDocumentsSummary(documents: Document[]): DocumentsSummary {
  return {
    total: documents.length,
    needsReview: documents.filter((document) => document.ocrStatus === 'needs_review').length,
  }
}

function amountForMonth(monthly: MonthlyStatistic[], key: string): number {
  return monthly.find((entry) => entry.month === key)?.amount ?? 0
}

/**
 * Phase 9: the headline cost cards (Monats-/Jahreskosten, Trend, Kategorien)
 * now read from the same central cost projection (domain/usecases/
 * centralCosts.ts) as /kostenuebersicht - Bill.totalAmount + WasteCost +
 * non-Bill-linked CostEntry, Contract excluded - instead of CostEntry
 * alone. This is what removes the previous inconsistency where the
 * Dashboard could show a different "Jahreskosten" figure than the rest of
 * the app for the same year. `getMonthlyCosts`/`getYearlyCosts`/
 * `getCostsByCategory` above remain exported, pure CostEntry-only
 * functions in their own right (still directly tested) - they are simply
 * no longer what this function itself calls.
 */
export async function getDashboardData(referenceDate: Date = new Date()): Promise<DashboardData> {
  const [users, costEntries, categories, contracts, bills, billItems, documents, wasteCosts] = await Promise.all([
    userRepository.getAll(),
    costEntryRepository.getAll(),
    categoryRepository.getAll(),
    contractRepository.getAll(),
    billRepository.getAll(),
    billItemRepository.getAll(),
    documentRepository.getAll(),
    wasteCostRepository.getAll(),
  ])

  const currentYear = referenceDate.getUTCFullYear()
  const currentMonth = referenceDate.getUTCMonth()
  const previousMonthDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1))
  const previousYear = currentYear - 1

  const items = buildCentralCostItems(bills, wasteCosts, costEntries)
  const currentYearMonthly = getCentralCostsByMonth(bills, costEntries, currentYear)
  // Cheap, in-memory - computed unconditionally so January correctly reads
  // December's amount from December of the *previous* year rather than
  // wrapping around within the current year's own 12-month array.
  const previousYearMonthly = getCentralCostsByMonth(bills, costEntries, previousYear)

  const currentMonthCost = amountForMonth(currentYearMonthly, monthKey(currentYear, currentMonth))
  const previousMonthMonthly = previousMonthDate.getUTCFullYear() === currentYear ? currentYearMonthly : previousYearMonthly
  const previousMonthCost = amountForMonth(
    previousMonthMonthly,
    monthKey(previousMonthDate.getUTCFullYear(), previousMonthDate.getUTCMonth()),
  )

  const currentYearWarnings = detectCostAggregationWarnings(bills, billItems, wasteCosts, costEntries, currentYear)
  const currentYearCost = getCentralCostSummary(items, currentYearMonthly, currentYearWarnings, currentYear).totalAmount
  const hasPreviousYearData = getCentralCostsByYear(items, previousYear).length > 0
  const previousYearCost = hasPreviousYearData
    ? getCentralCostSummary(items, previousYearMonthly, [], previousYear).totalAmount
    : undefined

  // The compact Dashboard card only shows categorized amounts - a Bill's
  // un-itemized portion (see BillDiscrepancyNotice on /statistik and the
  // same distinction on /kostenuebersicht) has no single category to
  // attribute to a bar here, so it is left out rather than invented.
  const categoryCosts: CategoryCost[] = getCentralCostsByCategory(bills, billItems, wasteCosts, costEntries, categories, currentYear)
    .filter((category) => category.categoryId !== undefined)
    .map((category) => ({
      categoryId: category.categoryId as string,
      categoryName: category.categoryName,
      categoryIcon: category.categoryIcon,
      amount: category.amount,
    }))

  return {
    userDisplayName: users[0]?.displayName,
    currentMonthCost,
    previousMonthCost,
    currentMonthChangePercent: calculatePercentageChange(previousMonthCost, currentMonthCost),
    currentYearCost,
    previousYearCost,
    currentYearChangePercent:
      previousYearCost !== undefined ? calculatePercentageChange(previousYearCost, currentYearCost) : null,
    monthlyCosts: currentYearMonthly.map((entry) => ({ month: entry.month, amount: entry.amount })),
    categoryCosts,
    currentYearWarnings,
    upcomingContracts: getUpcomingContractDeadlines(contracts, categories, referenceDate),
    latestBill: getLatestBill(bills),
    documentsSummary: getDocumentsSummary(documents),
    wasteCostsSummary: getWasteCostSummary(wasteCosts, currentYear),
  }
}

import { categoryRepository } from '../repositories/categories'
import { billRepository, contractRepository, documentRepository, userRepository } from '../repositories/indexedDbRepositories'
import type { BalanceType, Bill, Category, Contract, CostEntry, Document } from '../models/entities'
import { BILL_TYPE_LABELS } from './bills'
import { calculateRunningContractCosts, type RunningContractCosts } from './contracts'

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
  upcomingContracts: ContractDeadline[]
  latestBill?: BillSummary
  documentsSummary: DocumentsSummary
  /** Contractual monthly/yearly cost of currently active contracts - never
   * added to any expense figure (see calculateRunningContractCosts, E7):
   * these are planned/contractual figures, not money actually spent. */
  runningContractCosts: RunningContractCosts
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

/**
 * Phase 14G (E7): the Dashboard's money figures come only from bookings
 * (domain/usecases/finance/monthlyOverview.ts). This function only loads
 * the household cards around them - contract deadlines, the latest bill,
 * documents and the contractual running costs. The central cost projection
 * (Bill + WasteCost + CostEntry) stays on /kostenuebersicht ("erfasste
 * Kosten"); showing it next to the bookings would count bills that are
 * paid from the giro account twice. `getMonthlyCosts`/`getYearlyCosts`/
 * `getCostsByCategory` above remain exported, pure CostEntry-only
 * functions in their own right (still directly tested).
 */
export async function getDashboardData(referenceDate: Date = new Date()): Promise<DashboardData> {
  const [users, categories, contracts, bills, documents] = await Promise.all([
    userRepository.getAll(),
    categoryRepository.getAll(),
    contractRepository.getAll(),
    billRepository.getAll(),
    documentRepository.getAll(),
  ])

  return {
    userDisplayName: users[0]?.displayName,
    upcomingContracts: getUpcomingContractDeadlines(contracts, categories, referenceDate),
    latestBill: getLatestBill(bills),
    documentsSummary: getDocumentsSummary(documents),
    runningContractCosts: calculateRunningContractCosts(contracts, referenceDate),
  }
}

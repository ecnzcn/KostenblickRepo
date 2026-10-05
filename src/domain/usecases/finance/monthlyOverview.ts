import { OTHER_GROUPS_ID, UNCATEGORIZED_GROUP_ID } from '../../../constants/categoryGroups'
import type { Category, ImportBatch, Transaction } from '../../models/entities'
import { categoryRepository } from '../../repositories/categories'
import { importBatchRepository, transactionRepository } from '../../repositories/financeRepositories'
import { roundToCents } from '../../../utils/money'
import { coverageFromBatches, coveredMonthsByAccount } from '../fixedCosts/contractComparison'
import { addMonths, lastDayOf, monthOf, type MonthKey } from '../fixedCosts/months'
import { calculatePercentageChange } from '../percentageChange'

/**
 * Phase 14G: the dashboard's money figures, computed only from bookings
 * (E7) - never from bills, waste costs, cost entries or contract values.
 * Pure functions; getFinanceData() loads everything once and the month
 * switch only recomputes in memory.
 *
 * Flows (O-5): Einnahmen = income, Ausgaben = expense (a refund lowers
 * them), Gespart = saving (money flowing back lowers it), Saldo =
 * Einnahmen − Ausgaben − Gespart ("frei übrig"). Transfers count nowhere.
 */

export interface FlowTotals {
  income: number
  expenses: number
  saved: number
  /** Einnahmen − Ausgaben − Gespart. */
  balance: number
}

export function sumFlows(transactions: readonly Transaction[]): FlowTotals {
  let income = 0
  let expenses = 0
  let saved = 0
  for (const transaction of transactions) {
    if (transaction.flowType === 'income') income += transaction.amount
    else if (transaction.flowType === 'expense') expenses -= transaction.amount
    else if (transaction.flowType === 'saving') saved -= transaction.amount
  }
  return {
    income: roundToCents(income),
    expenses: roundToCents(expenses),
    saved: roundToCents(saved),
    balance: roundToCents(income - expenses - saved),
  }
}

export function transactionsInMonth(transactions: readonly Transaction[], month: MonthKey): Transaction[] {
  return transactions.filter((transaction) => monthOf(transaction.bookingDate) === month)
}

/** Months with bookings, newest first. */
export function bookingMonths(transactions: readonly Transaction[]): MonthKey[] {
  return [...new Set(transactions.map((transaction) => monthOf(transaction.bookingDate)))].sort().reverse()
}

/**
 * A month is complete when every account with bookings in it has the
 * whole month imported (see coveredMonthsByAccount) - a half-imported
 * month would make every comparison misleading.
 */
export function isMonthComplete(month: MonthKey, transactions: readonly Transaction[], batches: readonly ImportBatch[]): boolean {
  const accounts = new Set(transactionsInMonth(transactions, month).map((transaction) => transaction.accountId))
  if (accounts.size === 0) return false
  const covered = coveredMonthsByAccount(coverageFromBatches(batches))
  return [...accounts].every((accountId) => covered.get(accountId)?.has(month))
}

export interface MonthComparison {
  /** Previous month's totals; undefined when no comparison is possible. */
  previous?: FlowTotals
  /** Percentage change vs. previous month (calculatePercentageChange);
   * null when the previous value is 0. */
  incomePercent?: number | null
  expensesPercent?: number | null
  /** Saldo and Gespart compare in euros - a percentage of a possibly
   * negative base would be meaningless. */
  balanceDifference?: number
  savedDifference?: number
  /** Why there is no comparison, if there is none. */
  unavailableReason?: 'no_previous_month' | 'incomplete'
}

export function compareWithPreviousMonth(
  month: MonthKey,
  transactions: readonly Transaction[],
  batches: readonly ImportBatch[],
): MonthComparison {
  const previousMonth = addMonths(month, -1)
  const previousTransactions = transactionsInMonth(transactions, previousMonth)
  if (previousTransactions.length === 0) return { unavailableReason: 'no_previous_month' }
  if (!isMonthComplete(month, transactions, batches) || !isMonthComplete(previousMonth, transactions, batches)) {
    return { unavailableReason: 'incomplete' }
  }
  const current = sumFlows(transactionsInMonth(transactions, month))
  const previous = sumFlows(previousTransactions)
  return {
    previous,
    incomePercent: calculatePercentageChange(previous.income, current.income),
    expensesPercent: calculatePercentageChange(previous.expenses, current.expenses),
    balanceDifference: roundToCents(current.balance - previous.balance),
    savedDifference: roundToCents(current.saved - previous.saved),
  }
}

export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string
  income: number
  expenses: number
  /** Running totals from the 1st of the month up to and including this day. */
  cumulativeIncome: number
  cumulativeExpenses: number
}

/**
 * One point per calendar day with the real income/expenses of that day and
 * the running totals - no smoothing, no interpolation. In the current month
 * the series ends today.
 */
export function buildDailySeries(transactions: readonly Transaction[], month: MonthKey, today: string): DailyPoint[] {
  const lastDay = lastDayOf(month)
  const end = today < lastDay && monthOf(today) === month ? today : lastDay
  const bookingsByDay = new Map<string, Transaction[]>()
  for (const transaction of transactionsInMonth(transactions, month)) {
    const day = transaction.bookingDate.slice(0, 10)
    bookingsByDay.set(day, [...(bookingsByDay.get(day) ?? []), transaction])
  }

  const points: DailyPoint[] = []
  let cumulativeIncome = 0
  let cumulativeExpenses = 0
  const days = Number(end.slice(8, 10))
  for (let dayNumber = 1; dayNumber <= days; dayNumber += 1) {
    const date = `${month}-${String(dayNumber).padStart(2, '0')}`
    const bookings = bookingsByDay.get(date)
    const totals = bookings ? sumFlows(bookings) : undefined
    const income = totals?.income ?? 0
    const expenses = totals?.expenses ?? 0
    cumulativeIncome = roundToCents(cumulativeIncome + income)
    cumulativeExpenses = roundToCents(cumulativeExpenses + expenses)
    points.push({ date, income, expenses, cumulativeIncome, cumulativeExpenses })
  }
  return points
}

export interface CategoryGroupShare {
  /** Group id (Category.group or the category itself), UNCATEGORIZED_GROUP_ID
   * or OTHER_GROUPS_ID for the combined rest. */
  groupId: string
  name: string
  icon: string
  amount: number
  /** Share of the shown total, 0-1. */
  share: number
}

export const DEFAULT_VISIBLE_GROUPS = 5

/**
 * Expenses of the month by category group, largest first; the largest
 * `maxGroups` stay single, the rest is combined as "Weitere". Groups whose
 * refunds outweigh their expenses (net ≤ 0) are left out of the chart.
 */
export function expensesByGroup(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  maxGroups: number = DEFAULT_VISIBLE_GROUPS,
): CategoryGroupShare[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const amounts = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.flowType !== 'expense') continue
    const category = transaction.categoryId ? byId.get(transaction.categoryId) : undefined
    const groupId = transaction.categoryId ? (category?.group ?? transaction.categoryId) : UNCATEGORIZED_GROUP_ID
    amounts.set(groupId, (amounts.get(groupId) ?? 0) - transaction.amount)
  }
  const groups = [...amounts.entries()]
    .map(([groupId, amount]) => ({ groupId, amount: roundToCents(amount) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.groupId.localeCompare(b.groupId))

  const visible = groups.length > maxGroups + 1 ? groups.slice(0, maxGroups) : groups
  const rest = groups.slice(visible.length)
  const total = groups.reduce((sum, entry) => sum + entry.amount, 0)
  const describe = (groupId: string): Pick<CategoryGroupShare, 'name' | 'icon'> => {
    if (groupId === UNCATEGORIZED_GROUP_ID) return { name: 'Ohne Kategorie', icon: '❔' }
    const category = byId.get(groupId)
    return { name: category?.name ?? 'Unbekannte Kategorie', icon: category?.icon ?? '•' }
  }
  const shares: CategoryGroupShare[] = visible.map((entry) => ({ ...entry, ...describe(entry.groupId), share: total > 0 ? entry.amount / total : 0 }))
  if (rest.length > 0) {
    const amount = roundToCents(rest.reduce((sum, entry) => sum + entry.amount, 0))
    shares.push({ groupId: OTHER_GROUPS_ID, name: 'Weitere', icon: '•••', amount, share: total > 0 ? amount / total : 0 })
  }
  return shares
}

export interface RecentTransaction {
  transaction: Transaction
  category?: Category
}

export function recentTransactions(transactions: readonly Transaction[], categories: readonly Category[], limit = 5): RecentTransaction[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  return [...transactions]
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((transaction) => ({ transaction, category: transaction.categoryId ? byId.get(transaction.categoryId) : undefined }))
}

export interface FinanceData {
  transactions: Transaction[]
  categories: Category[]
  batches: ImportBatch[]
  /** Months with bookings, newest first. */
  months: MonthKey[]
  defaultMonth?: MonthKey
}

export interface FinanceOverview {
  month: MonthKey
  totals: FlowTotals
  comparison: MonthComparison
  complete: boolean
  daily: DailyPoint[]
  groups: CategoryGroupShare[]
  recent: RecentTransaction[]
  /** Income/expense bookings of the month still without a category. */
  uncategorizedCount: number
  transactionCount: number
}

export function buildFinanceOverview(data: FinanceData, month: MonthKey, today: string): FinanceOverview {
  const inMonth = transactionsInMonth(data.transactions, month)
  return {
    month,
    totals: sumFlows(inMonth),
    comparison: compareWithPreviousMonth(month, data.transactions, data.batches),
    complete: isMonthComplete(month, data.transactions, data.batches),
    daily: buildDailySeries(inMonth, month, today),
    groups: expensesByGroup(inMonth, data.categories),
    recent: recentTransactions(inMonth, data.categories),
    uncategorizedCount: inMonth.filter((entry) => !entry.categoryId && (entry.flowType === 'income' || entry.flowType === 'expense')).length,
    transactionCount: inMonth.length,
  }
}

export async function getFinanceData(): Promise<FinanceData> {
  const [transactions, categories, batches] = await Promise.all([
    transactionRepository.getAll(),
    categoryRepository.getAll(),
    importBatchRepository.getAll(),
  ])
  const months = bookingMonths(transactions)
  return { transactions, categories, batches, months, defaultMonth: months[0] }
}

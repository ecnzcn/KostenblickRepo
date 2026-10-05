import type { Contract, ImportBatch, Transaction } from '../../models/entities'
import { roundToCents } from '../../../utils/money'
import { addMonths, firstDayOf, lastDayOf, monthDistance, monthOf, nextDay, type MonthKey } from './months'

/**
 * Phase 14F: contract target (Soll) vs. actual debits (Ist). Pure.
 *
 * Soll is the contract's monthlyCost/yearlyCost - a contract value that is
 * shown next to the debits but never added to any expense sum (E7). Ist is
 * the net amount of the bookings linked to the contract (a returned debit
 * lowers it).
 *
 * A missing debit is only claimed for a month that the imported exports
 * cover completely and that lies after the first linked debit - an
 * incomplete export or a mandate that changed before the first linked
 * debit never produces a false "fehlt".
 */

export type ContractCadence = 'monthly' | 'yearly' | 'irregular'

export type ContractMonthStatus =
  /** Debit matches the Soll to the cent. */
  | 'ok'
  | 'deviation'
  /** No debit although the month is fully imported (monthly contracts). */
  | 'missing'
  /** No debit, but the month is not (fully) imported - nothing to claim. */
  | 'open'
  /** Debits without a Soll to compare (irregular payments). */
  | 'info'

export interface ContractMonth {
  month: MonthKey
  /** Soll for this month's debits; undefined when there is none to compare. */
  expected?: number
  /** Net debited amount as a positive number (refunds lower it). */
  actual: number
  bookingCount: number
  status: ContractMonthStatus
}

export interface ContractComparison {
  contract: Contract
  /** undefined while no linked debit exists. */
  cadence?: ContractCadence
  /** Linked bookings, newest first. */
  bookings: Transaction[]
  /** Newest first: the last months of a monthly contract, or the months
   * with debits of a yearly/irregular one. */
  months: ContractMonth[]
  missingCount: number
  deviationCount: number
}

/** Tolerance for recognizing a single debit as monthly or yearly. */
const CADENCE_AMOUNT_TOLERANCE = 0.25
export const CONTRACT_HISTORY_MONTHS = 6

export interface CoveragePeriod {
  accountId: string
  periodFrom: string
  periodTo: string
}

export function coverageFromBatches(batches: readonly ImportBatch[]): CoveragePeriod[] {
  return batches
    .filter((batch) => batch.periodFrom && batch.periodTo)
    .map((batch) => ({ accountId: batch.accountId, periodFrom: batch.periodFrom, periodTo: batch.periodTo }))
}

/**
 * Months each account's imports cover completely. Import periods run from
 * the first to the last booking date of a file, so the edge months are
 * only covered when another import closes the gap. Overlapping or
 * adjoining imports of one account are merged first.
 */
export function coveredMonthsByAccount(periods: readonly CoveragePeriod[]): Map<string, Set<MonthKey>> {
  const byAccount = new Map<string, CoveragePeriod[]>()
  for (const period of periods) byAccount.set(period.accountId, [...(byAccount.get(period.accountId) ?? []), period])

  const result = new Map<string, Set<MonthKey>>()
  for (const [accountId, accountPeriods] of byAccount) {
    const sorted = [...accountPeriods].sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))
    const merged: { from: string; to: string }[] = []
    for (const period of sorted) {
      const last = merged[merged.length - 1]
      if (last && period.periodFrom <= nextDay(last.to)) {
        if (period.periodTo > last.to) last.to = period.periodTo
      } else {
        merged.push({ from: period.periodFrom, to: period.periodTo })
      }
    }
    const months = new Set<MonthKey>()
    for (const { from, to } of merged) {
      for (let month = monthOf(from); monthDistance(month, monthOf(to)) >= 0; month = addMonths(month, 1)) {
        if (firstDayOf(month) >= from && lastDayOf(month) <= to) months.add(month)
      }
    }
    result.set(accountId, months)
  }
  return result
}

/** A month counts as covered for a contract when every account its debits
 * came from has it fully imported. */
function isCovered(month: MonthKey, accountIds: ReadonlySet<string>, covered: ReadonlyMap<string, ReadonlySet<MonthKey>>): boolean {
  if (accountIds.size === 0) return false
  for (const accountId of accountIds) {
    if (!covered.get(accountId)?.has(month)) return false
  }
  return true
}

function cents(value: number): number {
  return Math.round(value * 100)
}

function statusFor(expected: number, actual: number): ContractMonthStatus {
  return cents(expected) === cents(actual) ? 'ok' : 'deviation'
}

export function yearlyAmount(contract: Contract): number {
  return contract.yearlyCost ?? roundToCents(contract.monthlyCost * 12)
}

function near(value: number, target: number): boolean {
  return target > 0 && Math.abs(value - target) <= target * CADENCE_AMOUNT_TOLERANCE
}

/** Payment rhythm from the months with debits: gaps of about one month
 * mean monthly, about a year yearly. A single debit is judged by its
 * amount. Anything else is irregular - and gets no Soll comparison. */
export function detectCadence(contract: Contract, debitMonths: readonly MonthKey[], amounts: ReadonlyMap<MonthKey, number>): ContractCadence | undefined {
  if (debitMonths.length === 0) return undefined
  if (debitMonths.length === 1) {
    const amount = amounts.get(debitMonths[0] ?? '') ?? 0
    if (near(amount, contract.monthlyCost)) return 'monthly'
    if (yearlyAmount(contract) > contract.monthlyCost * 1.5 && near(amount, yearlyAmount(contract))) return 'yearly'
    return 'irregular'
  }
  const gaps = debitMonths.slice(1).map((month, index) => monthDistance(debitMonths[index] ?? month, month))
  const median = [...gaps].sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)] ?? 0
  if (median <= 1) return 'monthly'
  if (median >= 11 && median <= 13) return 'yearly'
  return 'irregular'
}

export function isContractActiveInMonth(contract: Contract, month: MonthKey): boolean {
  if (contract.deletedAt) return false
  if (contract.startDate.slice(0, 10) > lastDayOf(month)) return false
  return !contract.endDate || contract.endDate.slice(0, 10) >= firstDayOf(month)
}

interface DebitSummary {
  debitMonths: MonthKey[]
  amounts: Map<MonthKey, number>
  counts: Map<MonthKey, number>
}

function summarizeDebits(bookings: readonly Transaction[]): DebitSummary {
  const amounts = new Map<MonthKey, number>()
  const counts = new Map<MonthKey, number>()
  for (const booking of bookings) {
    const month = monthOf(booking.bookingDate)
    amounts.set(month, roundToCents((amounts.get(month) ?? 0) - booking.amount))
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  const debitMonths = [...amounts.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([month]) => month)
    .sort()
  return { debitMonths, amounts, counts }
}

/** Bookings that belong to the contract (refunds included). */
export function linkedBookings(contractId: string, transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((entry) => entry.contractId === contractId && (entry.flowType === 'expense' || entry.flowType === 'income'))
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || a.id.localeCompare(b.id))
}

/** Status of one month of a contract - shared by the contract detail and
 * the fixed cost overview, so both always say the same. */
export function contractMonthEntry(
  contract: Contract,
  cadence: ContractCadence | undefined,
  summary: DebitSummary,
  month: MonthKey,
  covered: boolean,
): ContractMonth | undefined {
  const actual = summary.amounts.get(month) ?? 0
  const bookingCount = summary.counts.get(month) ?? 0
  if (cadence === 'monthly') {
    if (bookingCount > 0) return { month, expected: contract.monthlyCost, actual, bookingCount, status: statusFor(contract.monthlyCost, actual) }
    const afterFirstDebit = summary.debitMonths[0] !== undefined && month >= summary.debitMonths[0]
    return { month, expected: contract.monthlyCost, actual: 0, bookingCount: 0, status: covered && afterFirstDebit && isContractActiveInMonth(contract, month) ? 'missing' : 'open' }
  }
  if (bookingCount === 0) return undefined
  if (cadence === 'yearly') {
    const expected = yearlyAmount(contract)
    return { month, expected, actual, bookingCount, status: statusFor(expected, actual) }
  }
  return { month, actual, bookingCount, status: 'info' }
}

export interface ComparisonInput {
  transactions: readonly Transaction[]
  coveredMonths: ReadonlyMap<string, ReadonlySet<MonthKey>>
  /** Today's month - nothing later is ever expected. */
  currentMonth: MonthKey
}

export function buildContractComparison(contract: Contract, input: ComparisonInput): ContractComparison {
  const bookings = linkedBookings(contract.id, input.transactions)
  const summary = summarizeDebits(bookings)
  const cadence = detectCadence(contract, summary.debitMonths, summary.amounts)
  const accountIds = new Set(bookings.map((entry) => entry.accountId))
  const covered = (month: MonthKey) => isCovered(month, accountIds, input.coveredMonths)

  let months: ContractMonth[] = []
  if (cadence === 'monthly') {
    const firstDebit = summary.debitMonths[0] as MonthKey
    const lastDebit = summary.debitMonths[summary.debitMonths.length - 1] as MonthKey
    let last = lastDebit
    for (let month = addMonths(lastDebit, 1); monthDistance(month, input.currentMonth) >= 0 && covered(month); month = addMonths(month, 1)) last = month
    if (contract.endDate && monthOf(contract.endDate) < last && monthOf(contract.endDate) >= lastDebit) last = monthOf(contract.endDate)
    for (let month = last; month >= firstDebit && months.length < CONTRACT_HISTORY_MONTHS; month = addMonths(month, -1)) {
      const entry = contractMonthEntry(contract, cadence, summary, month, covered(month))
      if (entry) months.push(entry)
    }
  } else if (cadence) {
    months = [...summary.debitMonths]
      .reverse()
      .slice(0, CONTRACT_HISTORY_MONTHS)
      .map((month) => contractMonthEntry(contract, cadence, summary, month, covered(month)))
      .filter((entry): entry is ContractMonth => entry !== undefined)
  }

  return {
    contract,
    cadence,
    bookings,
    months,
    missingCount: months.filter((entry) => entry.status === 'missing').length,
    deviationCount: months.filter((entry) => entry.status === 'deviation').length,
  }
}

export type FixedCostRowStatus = ContractMonthStatus | 'unlinked' | 'yearly_not_due'

export interface FixedCostRow {
  contract: Contract
  /** Monthly Soll from the contract - never an expense. */
  expected: number
  /** Net debits of the linked bookings in the month. */
  actual: number
  bookingCount: number
  cadence?: ContractCadence
  status: FixedCostRowStatus
  /** Soll of the debit itself when it differs from the monthly Soll
   * (the yearly amount of a yearly contract). */
  debitExpected?: number
}

export interface FixedCostOverview {
  month: MonthKey
  rows: FixedCostRow[]
  /** Sum of monthlyCost of the contracts active in the month (Soll). */
  expectedTotal: number
  /** Sum of the debits of linked contracts in the month (Ist). */
  actualTotal: number
  unlinkedCount: number
  missingCount: number
  deviationCount: number
  /** Whether every account with bookings is fully imported for the month. */
  monthCovered: boolean
}

export function buildFixedCostOverview(
  contracts: readonly Contract[],
  month: MonthKey,
  input: ComparisonInput,
): FixedCostOverview {
  const rows: FixedCostRow[] = contracts
    .filter((contract) => isContractActiveInMonth(contract, month))
    .map((contract) => {
      const bookings = linkedBookings(contract.id, input.transactions)
      const summary = summarizeDebits(bookings)
      const cadence = detectCadence(contract, summary.debitMonths, summary.amounts)
      if (bookings.length === 0) return { contract, expected: contract.monthlyCost, actual: 0, bookingCount: 0, status: 'unlinked' as const }
      const accountIds = new Set(bookings.map((entry) => entry.accountId))
      const entry = contractMonthEntry(contract, cadence, summary, month, isCovered(month, accountIds, input.coveredMonths))
      if (!entry) {
        return { contract, expected: contract.monthlyCost, actual: 0, bookingCount: 0, cadence, status: cadence === 'yearly' ? ('yearly_not_due' as const) : ('open' as const) }
      }
      return {
        contract,
        expected: contract.monthlyCost,
        actual: entry.actual,
        bookingCount: entry.bookingCount,
        cadence,
        status: entry.status,
        debitExpected: cadence === 'yearly' ? entry.expected : undefined,
      }
    })
    .sort((a, b) => a.contract.provider.localeCompare(b.contract.provider, 'de'))

  const accountsWithData = [...input.coveredMonths.keys()]
  return {
    month,
    rows,
    expectedTotal: roundToCents(rows.reduce((sum, row) => sum + row.expected, 0)),
    actualTotal: roundToCents(rows.reduce((sum, row) => sum + row.actual, 0)),
    unlinkedCount: rows.filter((row) => row.status === 'unlinked').length,
    missingCount: rows.filter((row) => row.status === 'missing').length,
    deviationCount: rows.filter((row) => row.status === 'deviation').length,
    monthCovered: accountsWithData.length > 0 && accountsWithData.every((accountId) => input.coveredMonths.get(accountId)?.has(month)),
  }
}

/** Months the overview can show, newest first: every fully imported month
 * and every month with a linked debit, up to the current month. */
export function fixedCostMonths(input: ComparisonInput, limit = 12): MonthKey[] {
  const months = new Set<MonthKey>()
  for (const accountMonths of input.coveredMonths.values()) for (const month of accountMonths) months.add(month)
  for (const booking of input.transactions) if (booking.contractId) months.add(monthOf(booking.bookingDate))
  return [...months]
    .filter((month) => month <= input.currentMonth)
    .sort()
    .reverse()
    .slice(0, limit)
}

/** Default month: the newest month that is fully imported for every
 * account, otherwise the newest available one, otherwise today's. */
export function defaultFixedCostMonth(input: ComparisonInput): MonthKey {
  const months = fixedCostMonths(input, Number.POSITIVE_INFINITY)
  const accounts = [...input.coveredMonths.keys()]
  return months.find((month) => accounts.every((accountId) => input.coveredMonths.get(accountId)?.has(month))) ?? months[0] ?? input.currentMonth
}

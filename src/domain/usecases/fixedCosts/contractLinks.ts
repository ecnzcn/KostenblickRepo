import { CREDIT_CARD_UNITEMIZED_CATEGORY_ID } from '../../../constants/categories'
import { getDatabase } from '../../../database/database'
import { STORE_NAMES } from '../../../database/schema'
import type { CategoryRule, Contract, Transaction } from '../../models/entities'
import { accountRepository, categoryRuleRepository, importBatchRepository, transactionRepository } from '../../repositories/financeRepositories'
import { contractRepository } from '../../repositories/indexedDbRepositories'
import { reconcileCardSettlements } from '../bankImport/reconcileCardSettlements'
import { normalizeRuleValue, recategorize, sortRules } from '../categorization/categorizeTransaction'
import { describeRule, saveRuleAndApply, type RuleDraft } from '../categorization/transactionCategorization'
import {
  buildContractComparison,
  buildFixedCostOverview,
  coverageFromBatches,
  coveredMonthsByAccount,
  defaultFixedCostMonth,
  fixedCostMonths,
  type ComparisonInput,
  type ContractComparison,
  type FixedCostOverview,
} from './contractComparison'
import { monthOf, type MonthKey } from './months'

/**
 * Phase 14F: links between contracts and bookings. A link is a rule
 * (CategoryRule with contractId) matching the creditor id, the mandate
 * reference or - least precise - the counterparty name exactly. Bookings
 * store the link as Transaction.contractId; a contract never stores a
 * reference to bookings (contracts sync, bookings stay on the device).
 * Suggestions are only suggestions: nothing is linked before the user
 * confirms.
 */

const LINK_FAILED = 'Die Verknüpfung konnte nicht gespeichert werden. Es wurde nichts verändert.'

/** The most precise way to recognize a booking's counterparty: a mandate
 * reference belongs to one contract, a creditor id to one company (which
 * may have several contracts), a name only roughly. */
export function linkDraftFor(transaction: Transaction): RuleDraft | undefined {
  if (transaction.mandateReference?.trim()) return { field: 'mandateReference', matchType: 'equals', pattern: transaction.mandateReference.trim() }
  if (transaction.creditorId?.trim()) return { field: 'creditorId', matchType: 'equals', pattern: transaction.creditorId.trim() }
  if (transaction.counterpartyName.trim()) return { field: 'counterpartyName', matchType: 'equals', pattern: transaction.counterpartyName.trim() }
  return undefined
}

function hasContract(contracts: readonly Contract[], id: string | undefined): boolean {
  return Boolean(id && contracts.some((contract) => contract.id === id && !contract.deletedAt))
}

/** Debits that could belong to a contract: expenses that are not a card
 * statement and not linked to an existing contract yet. */
export function isLinkCandidate(transaction: Transaction, contracts: readonly Contract[]): boolean {
  return (
    transaction.flowType === 'expense' &&
    transaction.amount < 0 &&
    transaction.categoryId !== CREDIT_CARD_UNITEMIZED_CATEGORY_ID &&
    !hasContract(contracts, transaction.contractId)
  )
}

export type SuggestionBasis = 'name' | 'amount' | 'name_and_amount'

export interface ContractLinkSuggestion {
  draft: RuleDraft
  description: string
  counterpartyName: string
  bookingCount: number
  lastBookingDate: string
  lastAmount: number
  basis: SuggestionBasis
}

const IGNORED_NAME_WORDS = new Set(['GMBH', 'MBH', 'DEUTSCHLAND', 'GERMANY', 'EUROPE', 'HOLDING', 'GRUPPE', 'SERVICE', 'SERVICES'])
const SUGGESTION_AMOUNT_TOLERANCE = 0.25

function words(value: string): Set<string> {
  return new Set(normalizeRuleValue('counterpartyName', value).split(/[^A-Z0-9ÄÖÜß]+/).filter(Boolean))
}

/**
 * Up to `limit` candidate debit groups for a contract, best first. A group
 * is suggested when the provider name appears in the counterparty name or
 * purpose, or when it was debited in at least two different months with
 * roughly the contract's monthly amount (±25 %).
 */
export function suggestContractLinks(
  contract: Contract,
  transactions: readonly Transaction[],
  contracts: readonly Contract[],
  limit = 3,
): ContractLinkSuggestion[] {
  const providerWords = [...words(contract.provider)].filter((word) => word.length >= 3 && !IGNORED_NAME_WORDS.has(word))
  const groups = new Map<string, { draft: RuleDraft; bookings: Transaction[] }>()
  for (const transaction of transactions) {
    if (!isLinkCandidate(transaction, contracts)) continue
    const draft = linkDraftFor(transaction)
    if (!draft) continue
    const key = `${draft.field}:${normalizeRuleValue(draft.field, draft.pattern)}`
    const group = groups.get(key) ?? { draft, bookings: [] }
    group.bookings.push(transaction)
    groups.set(key, group)
  }

  const scored: (ContractLinkSuggestion & { score: number })[] = []
  for (const { draft, bookings } of groups.values()) {
    const sorted = [...bookings].sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))
    const latest = sorted[0] as Transaction
    const nameMatch =
      providerWords.length > 0 &&
      sorted.some((booking) => {
        const bookingWords = new Set([...words(booking.counterpartyName), ...words(booking.purpose)])
        return providerWords.some((word) => bookingWords.has(word))
      })
    const monthsNearSoll = new Set(
      sorted
        .filter((booking) => contract.monthlyCost > 0 && Math.abs(-booking.amount - contract.monthlyCost) <= contract.monthlyCost * SUGGESTION_AMOUNT_TOLERANCE)
        .map((booking) => monthOf(booking.bookingDate)),
    )
    const amountMatch = monthsNearSoll.size >= 2
    if (!nameMatch && !amountMatch) continue
    const basis: SuggestionBasis = nameMatch && amountMatch ? 'name_and_amount' : nameMatch ? 'name' : 'amount'
    scored.push({
      draft,
      description: describeRule(draft),
      counterpartyName: latest.counterpartyName,
      bookingCount: sorted.length,
      lastBookingDate: latest.bookingDate,
      lastAmount: latest.amount,
      basis,
      score: basis === 'name_and_amount' ? 3 : basis === 'name' ? 2 : 1,
    })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.bookingCount - a.bookingCount || b.lastBookingDate.localeCompare(a.lastBookingDate))
    .slice(0, limit)
    .map((entry) => ({
      draft: entry.draft,
      description: entry.description,
      counterpartyName: entry.counterpartyName,
      bookingCount: entry.bookingCount,
      lastBookingDate: entry.lastBookingDate,
      lastAmount: entry.lastAmount,
      basis: entry.basis,
    }))
}

/** Links every booking matching the draft (and future imports) to the
 * contract. Bookings already linked to another existing contract keep
 * their link. Returns how many bookings changed. */
export async function linkContract(contractId: string, draft: RuleDraft, now: Date = new Date()): Promise<number> {
  if (!draft.pattern.trim()) throw new Error('Bitte gib an, worauf die Verknüpfung passen soll.')
  const contract = await contractRepository.getById(contractId)
  if (!contract || contract.deletedAt) throw new Error('Diesen Vertrag gibt es nicht mehr.')
  return saveRuleAndApply({ field: draft.field, matchType: 'equals', pattern: draft.pattern.trim(), contractId }, true, now, LINK_FAILED)
}

/** Removes the contract's link rules and the link from its bookings; the
 * bookings are then categorized again without it. */
export async function unlinkContract(contractId: string, now: Date = new Date()): Promise<void> {
  const nowIso = now.toISOString()
  const contracts = await contractRepository.getAll()
  const db = await getDatabase()
  const tx = db.transaction([STORE_NAMES.transactions, STORE_NAMES.accounts, STORE_NAMES.categoryRules], 'readwrite')
  tx.done.catch(() => undefined)
  try {
    const rulesStore = tx.objectStore(STORE_NAMES.categoryRules)
    const rules = await rulesStore.getAll()
    for (const rule of rules.filter((entry) => entry.contractId === contractId)) await rulesStore.delete(rule.id)
    const remainingRules = rules.filter((entry) => entry.contractId !== contractId)

    const transactions = tx.objectStore(STORE_NAMES.transactions)
    const accounts = await tx.objectStore(STORE_NAMES.accounts).getAll()
    const all = await transactions.getAll()
    const unlinked = all
      .filter((entry) => entry.contractId === contractId)
      .map((entry) => {
        const next: Transaction = { ...entry, updatedAt: nowIso }
        delete next.contractId
        if (next.categorySource === 'contract') next.categorySource = 'none'
        return next
      })
    const context = { rules: remainingRules, contracts, accountTypes: new Map(accounts.map((account) => [account.id, account.type])) }
    const recategorized = new Map(recategorize(unlinked, context, nowIso).map((entry) => [entry.id, entry]))
    const byId = new Map(all.map((entry) => [entry.id, entry]))
    for (const entry of unlinked) {
      const next = recategorized.get(entry.id) ?? entry
      byId.set(next.id, next)
      await transactions.put(next)
    }
    for (const change of reconcileCardSettlements([...byId.values()], accounts)) await transactions.put(change)
    await tx.done
  } catch {
    try {
      tx.abort()
    } catch {
      // already aborted
    }
    throw new Error('Die Verknüpfung konnte nicht aufgehoben werden. Es wurde nichts verändert.')
  }
}

/** Re-categorizes the bookings linked to a contract, e.g. after its
 * category changed or it was deleted (then its bookings fall back to the
 * other rules but keep the dangling link, shown as "nicht mehr
 * vorhanden"). */
export async function refreshContractBookings(contractId: string, now: Date = new Date()): Promise<void> {
  const linked = (await transactionRepository.getAll()).filter((entry) => entry.contractId === contractId)
  if (linked.length === 0) return
  const [rules, contracts, accounts] = await Promise.all([categoryRuleRepository.getAll(), contractRepository.getAll(), accountRepository.getAll()])
  const changes = recategorize(linked, { rules, contracts, accountTypes: new Map(accounts.map((account) => [account.id, account.type])) }, now.toISOString())
  if (changes.length > 0) await transactionRepository.saveMany(changes)
}

export interface ContractLinkRule {
  rule: CategoryRule
  description: string
}

export interface ContractBookingsData {
  comparison: ContractComparison
  rules: ContractLinkRule[]
  suggestions: ContractLinkSuggestion[]
  /** Whether any booking was imported at all - without, there is nothing
   * to link and the UI points to the import. */
  hasBookings: boolean
}

async function loadComparisonInput(now: Date): Promise<ComparisonInput & { contracts: Contract[]; rules: CategoryRule[] }> {
  const [transactions, batches, contracts, rules] = await Promise.all([
    transactionRepository.getAll(),
    importBatchRepository.getAll(),
    contractRepository.getAll(),
    categoryRuleRepository.getAll(),
  ])
  return {
    transactions,
    coveredMonths: coveredMonthsByAccount(coverageFromBatches(batches)),
    currentMonth: now.toISOString().slice(0, 7),
    contracts,
    rules,
  }
}

export async function getContractBookings(contract: Contract, now: Date = new Date()): Promise<ContractBookingsData> {
  const input = await loadComparisonInput(now)
  const comparison = buildContractComparison(contract, input)
  return {
    comparison,
    rules: sortRules(input.rules.filter((rule) => rule.contractId === contract.id)).map((rule) => ({ rule, description: describeRule(rule) })),
    suggestions: comparison.bookings.length > 0 ? [] : suggestContractLinks(contract, input.transactions, input.contracts),
    hasBookings: input.transactions.length > 0,
  }
}

export interface FixedCostData {
  input: ComparisonInput
  contracts: Contract[]
  months: MonthKey[]
  defaultMonth: MonthKey
  hasBookings: boolean
}

/** Loads everything for /vertraege/fixkosten once; switching the month
 * then only calls buildFixedCostOverview() on it. */
export async function getFixedCostData(now: Date = new Date()): Promise<FixedCostData> {
  const { contracts, transactions, coveredMonths, currentMonth } = await loadComparisonInput(now)
  const input: ComparisonInput = { transactions, coveredMonths, currentMonth }
  const active = contracts.filter((contract) => !contract.deletedAt)
  const months = fixedCostMonths(input)
  return { input, contracts: active, months: months.length > 0 ? months : [input.currentMonth], defaultMonth: defaultFixedCostMonth(input), hasBookings: input.transactions.length > 0 }
}

export function fixedCostOverviewFor(data: FixedCostData, month: MonthKey): FixedCostOverview {
  return buildFixedCostOverview(data.contracts, month, data.input)
}

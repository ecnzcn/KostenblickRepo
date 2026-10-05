import { CREDIT_CARD_UNITEMIZED_CATEGORY_ID, INCOME_CATEGORY_IDS, SAVINGS_CATEGORY_ID } from '../../../constants/categories'
import { getDatabase } from '../../../database/database'
import { STORE_NAMES } from '../../../database/schema'
import type { Account, Category, CategoryRule, CategoryRuleField, Contract, FlowType, Transaction } from '../../models/entities'
import { categoryRepository } from '../../repositories/categories'
import { accountRepository, categoryRuleRepository, transactionRepository } from '../../repositories/financeRepositories'
import { contractRepository } from '../../repositories/indexedDbRepositories'
import { generateId } from '../../../utils/id'
import { reconcileCardSettlements } from '../bankImport/reconcileCardSettlements'
import { flowForCategory, matchesRule, recategorize, sortRules } from './categorizeTransaction'

/**
 * Phase 14E: manual categorization and the user's own rules. A manual
 * choice always sets categorySource/flowTypeSource 'manual', so no rule
 * ever changes it afterwards. Writes that touch several bookings run in
 * one IndexedDB transaction and end with the card settlement pairing, so a
 * booking leaving or joining "transfer" never leaves a half pair behind.
 */

/** What the user picks for a booking - one control for category and flow. */
export type AssignmentChoice =
  | { kind: 'category'; categoryId: string }
  | { kind: 'saving' }
  | { kind: 'transfer' }
  | { kind: 'none' }

export function assignmentFromChoice(choice: AssignmentChoice, amount: number): { categoryId?: string; flowType: FlowType } {
  switch (choice.kind) {
    case 'category':
      return { categoryId: choice.categoryId, flowType: flowForCategory(choice.categoryId) }
    case 'saving':
      return { categoryId: SAVINGS_CATEGORY_ID, flowType: 'saving' }
    case 'transfer':
      return { flowType: 'transfer' }
    case 'none':
      return { flowType: amount >= 0 ? 'income' : 'expense' }
  }
}

export function choiceOf(transaction: Transaction): AssignmentChoice {
  if (transaction.flowType === 'transfer') return { kind: 'transfer' }
  if (transaction.flowType === 'saving') return { kind: 'saving' }
  return transaction.categoryId ? { kind: 'category', categoryId: transaction.categoryId } : { kind: 'none' }
}

async function loadContext(): Promise<{ contracts: Contract[] }> {
  return { contracts: await contractRepository.getAll() }
}

const WRITE_STORES = [STORE_NAMES.transactions, STORE_NAMES.accounts, STORE_NAMES.categoryRules] as const

/** Stores a manual assignment and re-runs the card pairing. */
export async function setTransactionAssignment(id: string, choice: AssignmentChoice, now: Date = new Date()): Promise<Transaction> {
  const db = await getDatabase()
  const tx = db.transaction([...WRITE_STORES], 'readwrite')
  tx.done.catch(() => undefined)
  try {
    const transactions = tx.objectStore(STORE_NAMES.transactions)
    const current = await transactions.get(id)
    if (!current) throw new Error('Diese Buchung gibt es nicht mehr.')
    const { categoryId, flowType } = assignmentFromChoice(choice, current.amount)
    const next: Transaction = {
      ...current,
      categoryId,
      categorySource: 'manual',
      flowType,
      flowTypeSource: 'manual',
      updatedAt: now.toISOString(),
    }
    if (next.categoryId === undefined) delete next.categoryId
    if (flowType !== 'transfer') delete next.transferPairId
    await transactions.put(next)

    const changes = reconcileCardSettlements(await transactions.getAll(), await tx.objectStore(STORE_NAMES.accounts).getAll())
    for (const change of changes) await transactions.put(change)
    await tx.done
    return changes.find((change) => change.id === id) ?? next
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // already aborted
    }
    throw error instanceof Error && error.message.startsWith('Diese Buchung')
      ? error
      : new Error('Die Zuordnung konnte nicht gespeichert werden. Es wurde nichts verändert.')
  }
}

export interface RuleDraft {
  field: CategoryRuleField
  matchType: CategoryRule['matchType']
  pattern: string
}

export const RULE_FIELD_LABELS: Record<CategoryRuleField, string> = {
  creditorId: 'Gläubiger-ID',
  counterpartyIban: 'IBAN der Gegenpartei',
  counterpartyName: 'Name der Gegenpartei',
  purpose: 'Verwendungszweck',
  mandateReference: 'Mandatsreferenz',
}

/** Possible rules for "Immer so zuordnen?", most precise first: a creditor
 * id or IBAN identifies a counterparty exactly, a name only roughly. */
export function suggestRuleDrafts(transaction: Transaction): RuleDraft[] {
  const drafts: RuleDraft[] = []
  if (transaction.creditorId) drafts.push({ field: 'creditorId', matchType: 'equals', pattern: transaction.creditorId })
  if (transaction.counterpartyIban) drafts.push({ field: 'counterpartyIban', matchType: 'equals', pattern: transaction.counterpartyIban })
  if (transaction.counterpartyName.trim()) {
    drafts.push({ field: 'counterpartyName', matchType: 'contains', pattern: transaction.counterpartyName.trim() })
  }
  if (transaction.purpose.trim()) drafts.push({ field: 'purpose', matchType: 'contains', pattern: transaction.purpose.trim() })
  return drafts
}

/** Other bookings a rule would re-categorize (manual ones never count). */
export async function countRuleMatches(draft: RuleDraft, excludeId?: string): Promise<number> {
  const transactions = await transactionRepository.getAll()
  return transactions.filter((entry) => entry.id !== excludeId && entry.categorySource !== 'manual' && matchesRule(draft, entry)).length
}

export interface CreateRuleInput extends RuleDraft {
  choice: Exclude<AssignmentChoice, { kind: 'none' }>
  applyToExisting: boolean
}

export function ruleTarget(choice: CreateRuleInput['choice']): Pick<CategoryRule, 'categoryId' | 'flowType'> {
  switch (choice.kind) {
    case 'category':
      return { categoryId: choice.categoryId }
    case 'saving':
      return { categoryId: SAVINGS_CATEGORY_ID, flowType: 'saving' }
    case 'transfer':
      return { flowType: 'transfer' }
  }
}

/** Saves a rule (highest priority so far) and optionally applies it to the
 * matching bookings that were not assigned by hand. Returns how many
 * bookings changed. */
export async function createRule(input: CreateRuleInput, now: Date = new Date()): Promise<number> {
  if (!input.pattern.trim()) throw new Error('Bitte gib an, worauf die Regel passen soll.')
  return saveRuleAndApply(
    { field: input.field, matchType: input.matchType, pattern: input.pattern.trim(), ...ruleTarget(input.choice) },
    input.applyToExisting,
    now,
    'Die Regel konnte nicht gespeichert werden. Es wurde nichts verändert.',
  )
}

type NewRule = Pick<CategoryRule, 'field' | 'matchType' | 'pattern' | 'categoryId' | 'flowType' | 'contractId'>

/** Shared by category rules (14E) and contract link rules (14F): one
 * IndexedDB transaction stores the rule, re-categorizes the bookings it
 * matches and re-runs the card settlement pairing. */
export async function saveRuleAndApply(fields: NewRule, applyToExisting: boolean, now: Date, failureMessage: string): Promise<number> {
  const nowIso = now.toISOString()
  const { contracts } = await loadContext()
  const db = await getDatabase()
  const tx = db.transaction([...WRITE_STORES], 'readwrite')
  tx.done.catch(() => undefined)
  try {
    const rulesStore = tx.objectStore(STORE_NAMES.categoryRules)
    const existing = await rulesStore.getAll()
    const rule: CategoryRule = {
      id: generateId(),
      ...fields,
      priority: Math.max(0, ...existing.map((entry) => entry.priority)) + 1,
      createdFrom: 'manual',
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    for (const key of ['categoryId', 'flowType', 'contractId'] as const) {
      if (rule[key] === undefined) delete rule[key]
    }
    await rulesStore.put(rule)

    let changed = 0
    if (applyToExisting) {
      const transactions = tx.objectStore(STORE_NAMES.transactions)
      const accounts = await tx.objectStore(STORE_NAMES.accounts).getAll()
      const all = await transactions.getAll()
      const context = { rules: [...existing, rule], contracts, accountTypes: new Map(accounts.map((account) => [account.id, account.type])) }
      const changes = recategorize(all.filter((entry) => matchesRule(rule, entry)), context, nowIso)
      for (const change of changes) await transactions.put(change)
      const byId = new Map(all.map((entry) => [entry.id, entry]))
      for (const change of changes) byId.set(change.id, change)
      for (const change of reconcileCardSettlements([...byId.values()], accounts)) await transactions.put(change)
      changed = changes.length
    }
    await tx.done
    return changed
  } catch {
    try {
      tx.abort()
    } catch {
      // already aborted
    }
    throw new Error(failureMessage)
  }
}

/** Deleting a rule leaves the bookings it categorized as they are. */
export async function deleteRule(id: string): Promise<void> {
  await categoryRuleRepository.delete(id)
}

export interface RuleOverviewEntry {
  rule: CategoryRule
  description: string
  target: string
}

export function describeRuleTarget(
  rule: Pick<CategoryRule, 'categoryId' | 'flowType' | 'contractId'>,
  categories: readonly Category[],
  contracts: readonly Contract[] = [],
): string {
  if (rule.contractId) {
    const contract = contracts.find((entry) => entry.id === rule.contractId && !entry.deletedAt)
    return contract ? `Vertrag ${contract.provider}` : 'Vertrag nicht mehr vorhanden'
  }
  if (rule.flowType === 'transfer') return 'Umbuchung (zählt nicht)'
  if (rule.flowType === 'saving') return 'Sparen'
  return categories.find((category) => category.id === rule.categoryId)?.name ?? 'Unbekannte Kategorie'
}

export function describeRule(rule: Pick<CategoryRule, 'field' | 'matchType' | 'pattern'>): string {
  return `${RULE_FIELD_LABELS[rule.field]} ${rule.matchType === 'equals' ? 'ist' : 'enthält'} „${rule.pattern}“`
}

export async function listRules(): Promise<RuleOverviewEntry[]> {
  const [rules, categories, contracts] = await Promise.all([categoryRuleRepository.getAll(), categoryRepository.getAll(), contractRepository.getAll()])
  return sortRules(rules).map((rule) => ({ rule, description: describeRule(rule), target: describeRuleTarget(rule, categories, contracts) }))
}

export interface TransactionDetail {
  transaction: Transaction
  account?: Account
  category?: Category
  /** The other half of a card settlement pair, if any. */
  pair?: Transaction
  categories: Category[]
  /** The linked contract, if it still exists (14F). */
  contract?: Contract
  /** Contracts the booking could be linked to. */
  contracts: Contract[]
}

export interface AssignmentOptions {
  expense: Category[]
  income: Category[]
}

/** Categories a user can pick for a booking. "Sparen" and "Kreditkarte
 * (nicht aufgeschlüsselt)" are not offered as plain categories: saving is
 * its own choice, the card category belongs to the settlement pairing. */
export function assignmentOptions(categories: readonly Category[]): AssignmentOptions {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'de')
  return {
    expense: categories
      .filter((category) => !INCOME_CATEGORY_IDS.has(category.id) && category.id !== SAVINGS_CATEGORY_ID && category.id !== CREDIT_CARD_UNITEMIZED_CATEGORY_ID)
      .sort(byName),
    income: categories.filter((category) => INCOME_CATEGORY_IDS.has(category.id)).sort(byName),
  }
}

export const CATEGORY_SOURCE_LABELS: Record<Transaction['categorySource'], string> = {
  manual: 'von dir zugeordnet',
  rule: 'durch eine Regel',
  contract: 'über den verknüpften Vertrag',
  bank: 'Vorschlag der Sparkasse',
  none: '',
}

export async function getTransactionDetail(id: string): Promise<TransactionDetail | undefined> {
  const transaction = await transactionRepository.getById(id)
  if (!transaction) return undefined
  const [account, categories, pair, allContracts] = await Promise.all([
    accountRepository.getById(transaction.accountId),
    categoryRepository.getAll(),
    transaction.transferPairId ? transactionRepository.getById(transaction.transferPairId) : Promise.resolve(undefined),
    contractRepository.getAll(),
  ])
  const contracts = allContracts.filter((contract) => !contract.deletedAt).sort((a, b) => a.provider.localeCompare(b.provider, 'de'))
  return {
    transaction,
    account,
    category: categories.find((category) => category.id === transaction.categoryId),
    pair,
    categories,
    contract: contracts.find((contract) => contract.id === transaction.contractId),
    contracts,
  }
}

/** Income/expense bookings still without a category, newest first. */
export function selectUncategorized(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((entry) => !entry.categoryId && (entry.flowType === 'income' || entry.flowType === 'expense'))
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || a.id.localeCompare(b.id))
}

export async function listUncategorized(): Promise<Transaction[]> {
  return selectUncategorized(await transactionRepository.getAll())
}

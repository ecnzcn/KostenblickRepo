import { INCOME_CATEGORY_IDS, SAVINGS_CATEGORY_ID } from '../../../constants/categories'
import { MERCHANT_CATEGORY_CODE_MAP, STANDARD_NAME_RULES } from '../../../constants/standardCategoryRules'
import type { AccountType, CategoryRule, Contract, FlowType, Transaction } from '../../models/entities'
import { CREDIT_CARD_BOOKING_TEXT } from '../../models/bankImport'
import { GIRO_CARD_SETTLEMENT_TEXT, classifyBankRow } from '../bankImport/classifyBankRow'

/**
 * Phase 14E rule engine - pure. Order (spec 14E):
 * manual → contract link → own rules by priority → structural booking-text
 * rules → standard rules (known names, card merchant code) → Sparkasse
 * category → none. A manual category or flow is never changed.
 *
 * Category and flow belong together for income/expense (14A O-8): an
 * income category means income, an expense category means expense - so a
 * positive booking a user (or their rule) files under an expense category
 * is a refund that lowers that category's expenses.
 */

export type Assignment = Pick<Transaction, 'categoryId' | 'categorySource' | 'flowType' | 'flowTypeSource' | 'isReversal' | 'contractId'>

export interface CategorizationContext {
  rules: readonly CategoryRule[]
  contracts: readonly Contract[]
  accountTypes: ReadonlyMap<string, AccountType>
}

export function normalizeRuleValue(field: CategoryRule['field'], value: string | undefined): string {
  const text = value ?? ''
  return field === 'creditorId' || field === 'counterpartyIban' || field === 'mandateReference'
    ? text.replace(/\s+/g, '').toUpperCase()
    : text.replace(/\s+/g, ' ').trim().toUpperCase()
}

export function matchesRule(rule: Pick<CategoryRule, 'field' | 'matchType' | 'pattern'>, transaction: Transaction): boolean {
  const pattern = normalizeRuleValue(rule.field, rule.pattern)
  if (!pattern) return false
  const value = normalizeRuleValue(rule.field, transaction[rule.field])
  return rule.matchType === 'equals' ? value === pattern : value.includes(pattern)
}

/** Flow implied by a category the user (or their rule) chose. */
export function flowForCategory(categoryId: string): FlowType {
  if (categoryId === SAVINGS_CATEGORY_ID) return 'saving'
  return INCOME_CATEGORY_IDS.has(categoryId) ? 'income' : 'expense'
}

function standardSuggestion(transaction: Transaction, accountType: AccountType): string | undefined {
  const name = ` ${normalizeRuleValue('counterpartyName', transaction.counterpartyName).replace(/[^A-Z0-9ÄÖÜ]+/g, ' ')} `
  for (const rule of STANDARD_NAME_RULES) {
    if (rule.words.some((word) => name.includes(` ${word} `))) return rule.categoryId
  }
  if (accountType === 'credit_card' && transaction.merchantCategoryCode) {
    return MERCHANT_CATEGORY_CODE_MAP[transaction.merchantCategoryCode]
  }
  return undefined
}

/** Card statement bookings belong to reconcileCardSettlements(), which
 * decides between transfer and "nicht aufgeschlüsselt". */
function isCardSettlement(transaction: Transaction, accountType: AccountType): boolean {
  if (accountType === 'credit_card') return transaction.amount > 0 && transaction.bookingText === CREDIT_CARD_BOOKING_TEXT.settlement
  return transaction.amount < 0 && transaction.bookingText.replace(/\s+/g, ' ').trim().toUpperCase() === GIRO_CARD_SETTLEMENT_TEXT
}

export function sortRules(rules: readonly CategoryRule[]): CategoryRule[] {
  return [...rules].sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
}

export function categorizeTransaction(transaction: Transaction, context: CategorizationContext): Assignment {
  const accountType = context.accountTypes.get(transaction.accountId) ?? 'giro'
  const base = classifyBankRow(transaction, accountType)
  const manualFlow = transaction.flowTypeSource === 'manual'
  const settlement = isCardSettlement(transaction, accountType)
  const contractId = linkedContractId(transaction, context, settlement || (manualFlow ? transaction.flowType : base.flowType) !== 'expense')
  const withFlow = (assignment: Omit<Assignment, 'flowType' | 'flowTypeSource'>, flowType: FlowType, flowTypeSource: Assignment['flowTypeSource']): Assignment =>
    manualFlow
      ? { ...assignment, flowType: transaction.flowType, flowTypeSource: 'manual' }
      : { ...assignment, flowType, flowTypeSource }

  if (transaction.categorySource === 'manual' || (!manualFlow && settlement)) {
    return {
      categoryId: transaction.categoryId,
      categorySource: transaction.categorySource,
      flowType: transaction.flowType,
      flowTypeSource: transaction.flowTypeSource,
      isReversal: base.isReversal,
      contractId,
    }
  }

  const contract = contractId ? findContract(context, contractId) : undefined
  if (contract) {
    return withFlow(
      { categoryId: contract.categoryId, categorySource: 'contract', isReversal: base.isReversal, contractId },
      flowForCategory(contract.categoryId),
      'auto',
    )
  }

  const rule = sortRules(context.rules.filter((entry) => !entry.contractId)).find((entry) => matchesRule(entry, transaction))
  if (rule) {
    if (rule.flowType === 'transfer') return withFlow({ categorySource: 'rule', isReversal: base.isReversal, contractId }, 'transfer', 'rule')
    const categoryId = rule.flowType === 'saving' ? (rule.categoryId ?? SAVINGS_CATEGORY_ID) : rule.categoryId
    if (categoryId) {
      return withFlow({ categoryId, categorySource: 'rule', isReversal: base.isReversal, contractId }, rule.flowType ?? flowForCategory(categoryId), 'rule')
    }
  }

  const structural = base.categorySource === 'rule' || base.flowType === 'transfer' || base.flowType === 'saving'
  if (!structural && base.flowType === 'expense') {
    const suggestion = standardSuggestion(transaction, accountType)
    if (suggestion) return withFlow({ categoryId: suggestion, categorySource: 'rule', isReversal: base.isReversal, contractId }, 'expense', 'auto')
  }

  return withFlow({ categoryId: base.categoryId, categorySource: base.categorySource, isReversal: base.isReversal, contractId }, base.flowType, 'auto')
}

function findContract(context: CategorizationContext, id: string): Contract | undefined {
  return context.contracts.find((entry) => entry.id === id && !entry.deletedAt)
}

/** The contract a booking belongs to: an existing link stays; otherwise a
 * contract link rule may link an expense booking (14F). A link to a
 * contract that no longer exists stays untouched unless a rule relinks. */
function linkedContractId(transaction: Transaction, context: CategorizationContext, notLinkable: boolean): string | undefined {
  if (transaction.contractId && findContract(context, transaction.contractId)) return transaction.contractId
  if (notLinkable) return transaction.contractId
  const rule = sortRules(context.rules.filter((entry) => entry.contractId && findContract(context, entry.contractId))).find((entry) =>
    matchesRule(entry, transaction),
  )
  return rule?.contractId ?? transaction.contractId
}

function sameAssignment(transaction: Transaction, assignment: Assignment): boolean {
  return (
    transaction.categoryId === assignment.categoryId &&
    transaction.categorySource === assignment.categorySource &&
    transaction.flowType === assignment.flowType &&
    transaction.flowTypeSource === assignment.flowTypeSource &&
    Boolean(transaction.isReversal) === Boolean(assignment.isReversal) &&
    transaction.contractId === assignment.contractId
  )
}

/** Applies an assignment without leaving `undefined` keys behind. */
export function withAssignment(transaction: Transaction, assignment: Assignment, now: string): Transaction {
  const next: Transaction = { ...transaction, ...assignment, updatedAt: now }
  if (next.categoryId === undefined) delete next.categoryId
  if (!next.isReversal) delete next.isReversal
  if (next.contractId === undefined) delete next.contractId
  if (next.flowType !== 'transfer') delete next.transferPairId
  return next
}

/** Re-categorizes the given bookings; returns only those that change.
 * Manual assignments come back unchanged by construction. */
export function recategorize(transactions: readonly Transaction[], context: CategorizationContext, now: string): Transaction[] {
  const changes: Transaction[] = []
  for (const transaction of transactions) {
    const assignment = categorizeTransaction(transaction, context)
    if (!sameAssignment(transaction, assignment)) changes.push(withAssignment(transaction, assignment, now))
  }
  return changes
}

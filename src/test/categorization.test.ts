import { describe, expect, it } from 'vitest'
import { CREDIT_CARD_UNITEMIZED_CATEGORY_ID } from '../constants/categories'
import type { AccountType, CategoryRule, Contract, Transaction } from '../domain/models/entities'
import {
  categorizeTransaction,
  matchesRule,
  recategorize,
  type CategorizationContext,
} from '../domain/usecases/categorization/categorizeTransaction'

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    accountId: 'giro',
    bookingDate: '2026-09-01',
    amount: -42.5,
    currency: 'EUR',
    counterpartyName: 'Gegenpartei 001',
    purpose: 'Verwendungszweck 0001',
    bookingText: 'FOLGELASTSCHRIFT',
    categorySource: 'none',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'b',
    dedupeKey: 'k',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function rule(overrides: Partial<CategoryRule>): CategoryRule {
  return {
    id: 'r1',
    field: 'counterpartyName',
    matchType: 'contains',
    pattern: 'Gegenpartei 001',
    priority: 1,
    createdFrom: 'manual',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '',
    ...overrides,
  }
}

function context(rules: CategoryRule[] = [], contracts: Contract[] = [], types: [string, AccountType][] = []): CategorizationContext {
  return { rules, contracts, accountTypes: new Map([['giro', 'giro'], ['card', 'credit_card'], ...types]) }
}

describe('matchesRule', () => {
  it('ignores case and spacing; IBAN and creditor id ignore all spaces', () => {
    expect(matchesRule(rule({ pattern: 'gegenpartei  001' }), tx())).toBe(true)
    expect(matchesRule(rule({ matchType: 'equals', pattern: 'Gegenpartei' }), tx())).toBe(false)
    expect(matchesRule(rule({ field: 'counterpartyIban', matchType: 'equals', pattern: 'de99 0000 0000 0000 0000 13' }), tx({ counterpartyIban: 'DE99000000000000000013' }))).toBe(true)
    expect(matchesRule(rule({ pattern: '' }), tx())).toBe(false)
  })
})

describe('categorizeTransaction', () => {
  it('follows the order: own rule beats standard rule beats Sparkasse category', () => {
    const booking = tx({ counterpartyName: 'Rewe Muster GmbH', bankCategory: 'Einkäufe' })
    expect(categorizeTransaction(booking, context())).toMatchObject({ categoryId: 'groceries', categorySource: 'rule' })
    expect(categorizeTransaction(tx({ bankCategory: 'Einkäufe' }), context())).toMatchObject({ categoryId: 'shopping', categorySource: 'bank' })
    expect(
      categorizeTransaction(booking, context([rule({ pattern: 'Rewe', categoryId: 'leisure' })])),
    ).toMatchObject({ categoryId: 'leisure', categorySource: 'rule', flowTypeSource: 'rule' })
  })

  it('uses the higher-priority rule when several match', () => {
    const rules = [rule({ id: 'a', categoryId: 'leisure', priority: 1 }), rule({ id: 'b', categoryId: 'health', priority: 2 })]
    expect(categorizeTransaction(tx(), context(rules)).categoryId).toBe('health')
  })

  it('never changes a manual assignment, whatever rules exist', () => {
    const manual = tx({ categoryId: 'clothing', categorySource: 'manual', flowTypeSource: 'manual' })
    const result = categorizeTransaction(manual, context([rule({ categoryId: 'leisure', priority: 99 })]))
    expect(result).toMatchObject({ categoryId: 'clothing', categorySource: 'manual', flowType: 'expense', flowTypeSource: 'manual' })
    expect(recategorize([manual], context([rule({ categoryId: 'leisure' })]), 'now')).toEqual([])
  })

  it('keeps a manual flow while a rule sets the category', () => {
    const booking = tx({ flowType: 'saving', flowTypeSource: 'manual' })
    expect(categorizeTransaction(booking, context([rule({ categoryId: 'leisure' })]))).toMatchObject({
      categoryId: 'leisure',
      flowType: 'saving',
      flowTypeSource: 'manual',
    })
  })

  it('takes the category of a linked contract', () => {
    const contract = { id: 'c1', categoryId: 'telecom', deletedAt: null } as Contract
    expect(categorizeTransaction(tx({ contractId: 'c1' }), context([], [contract]))).toMatchObject({
      categoryId: 'telecom',
      categorySource: 'contract',
    })
    // A link to a contract that no longer exists is simply ignored.
    expect(categorizeTransaction(tx({ contractId: 'gone', bankCategory: 'Telekommunikation' }), context()).categorySource).toBe('bank')
  })

  it('marks transfers to an own account via a flow rule', () => {
    const own = rule({ field: 'counterpartyIban', matchType: 'equals', pattern: 'DE99000000000000000013', flowType: 'saving' })
    expect(categorizeTransaction(tx({ counterpartyIban: 'DE99000000000000000013', bankCategory: 'Mobilität' }), context([own]))).toMatchObject({
      flowType: 'saving',
      categoryId: 'savings',
    })
    const transfer = rule({ flowType: 'transfer' })
    const result = categorizeTransaction(tx({ bankCategory: 'Mobilität' }), context([transfer]))
    expect(result.flowType).toBe('transfer')
    expect(result.categoryId).toBeUndefined()
  })

  it('treats a positive booking filed under an expense category as a refund (O-8)', () => {
    expect(categorizeTransaction(tx({ amount: 221.14 }), context([rule({ categoryId: 'housing' })]))).toMatchObject({
      categoryId: 'housing',
      flowType: 'expense',
    })
    expect(categorizeTransaction(tx({ amount: 2850 }), context([rule({ categoryId: 'salary' })]))).toMatchObject({ flowType: 'income' })
  })

  it('categorizes card purchases by merchant category code', () => {
    expect(categorizeTransaction(tx({ accountId: 'card', bookingText: 'KARTENUMSATZ', merchantCategoryCode: '5411' }), context())).toMatchObject({
      categoryId: 'groceries',
      categorySource: 'rule',
    })
    expect(categorizeTransaction(tx({ accountId: 'card', bookingText: 'KARTENUMSATZ', merchantCategoryCode: '6540' }), context()).categorySource).toBe('none')
  })

  it('never puts a standard expense category on income', () => {
    expect(categorizeTransaction(tx({ amount: 12.3, counterpartyName: 'Rewe Muster GmbH' }), context())).toEqual({
      categorySource: 'none',
      flowType: 'income',
      flowTypeSource: 'auto',
      categoryId: undefined,
      isReversal: undefined,
    })
  })

  it('leaves card statement bookings to the settlement pairing', () => {
    const paired = tx({ bookingText: 'EIGENE KREDITKARTENABRECHN.', flowType: 'transfer', transferPairId: 'c', categorySource: 'none' })
    expect(recategorize([paired], context([rule({ categoryId: 'leisure' })]), 'now')).toEqual([])
    const unpaired = tx({ bookingText: 'EIGENE KREDITKARTENABRECHN.', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, categorySource: 'rule' })
    expect(categorizeTransaction(unpaired, context()).categoryId).toBe(CREDIT_CARD_UNITEMIZED_CATEGORY_ID)
  })
})

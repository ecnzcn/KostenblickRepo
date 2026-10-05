import { describe, expect, it } from 'vitest'
import type { Contract, Transaction } from '../domain/models/entities'
import {
  buildContractComparison,
  buildFixedCostOverview,
  coveredMonthsByAccount,
  defaultFixedCostMonth,
  detectCadence,
  fixedCostMonths,
  type ComparisonInput,
} from '../domain/usecases/fixedCosts/contractComparison'
import { linkDraftFor, suggestContractLinks } from '../domain/usecases/fixedCosts/contractLinks'
import { addMonths, lastDayOf, monthDistance, monthRange } from '../domain/usecases/fixedCosts/months'

let nextId = 0
function tx(overrides: Partial<Transaction> = {}): Transaction {
  nextId += 1
  return {
    id: `t${nextId}`,
    accountId: 'giro',
    bookingDate: '2026-09-01',
    amount: -39.99,
    currency: 'EUR',
    counterpartyName: 'Gegenpartei 001',
    purpose: '',
    bookingText: 'FOLGELASTSCHRIFT',
    categorySource: 'none',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'b',
    dedupeKey: `k${nextId}`,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    userId: 'local-user',
    categoryId: 'telecom',
    provider: 'Telekom',
    monthlyCost: 39.99,
    yearlyCost: 479.88,
    startDate: '2024-01-01',
    autoRenewal: true,
    reminderEnabled: false,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    syncVersion: 1,
    ...overrides,
  }
}

/** Giro fully imported from January to September 2026. */
function input(transactions: Transaction[], periods = [{ accountId: 'giro', periodFrom: '2026-01-01', periodTo: '2026-09-30' }]): ComparisonInput {
  return { transactions, coveredMonths: coveredMonthsByAccount(periods), currentMonth: '2026-10' }
}

function debit(month: string, amount = -39.99, overrides: Partial<Transaction> = {}): Transaction {
  return tx({ bookingDate: `${month}-15`, amount, contractId: 'c1', ...overrides })
}

describe('months', () => {
  it('does month arithmetic across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthDistance('2025-12', '2026-02')).toBe(2)
    expect(lastDayOf('2028-02')).toBe('2028-02-29')
    expect(monthRange('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01'])
  })
})

describe('coveredMonthsByAccount', () => {
  it('counts only months the imports cover completely', () => {
    const covered = coveredMonthsByAccount([{ accountId: 'giro', periodFrom: '2026-01-03', periodTo: '2026-04-30' }])
    expect([...(covered.get('giro') ?? [])]).toEqual(['2026-02', '2026-03', '2026-04'])
  })

  it('merges overlapping and adjoining imports of one account, not of different accounts', () => {
    const covered = coveredMonthsByAccount([
      { accountId: 'giro', periodFrom: '2026-01-01', periodTo: '2026-02-20' },
      { accountId: 'giro', periodFrom: '2026-02-21', periodTo: '2026-03-31' },
      { accountId: 'giro', periodFrom: '2026-05-02', periodTo: '2026-06-30' },
      { accountId: 'card', periodFrom: '2026-01-15', periodTo: '2026-02-28' },
    ])
    expect([...(covered.get('giro') ?? [])]).toEqual(['2026-01', '2026-02', '2026-03', '2026-06'])
    expect([...(covered.get('card') ?? [])]).toEqual(['2026-02'])
  })
})

describe('detectCadence', () => {
  const amounts = (entries: [string, number][]) => new Map(entries)

  it('recognizes monthly, yearly and irregular debits', () => {
    expect(detectCadence(contract(), ['2026-06', '2026-07', '2026-09'], amounts([]))).toBe('monthly')
    expect(detectCadence(contract(), ['2024-03', '2025-03', '2026-03'], amounts([]))).toBe('yearly')
    expect(detectCadence(contract(), ['2026-01', '2026-04', '2026-07'], amounts([]))).toBe('irregular')
    expect(detectCadence(contract(), [], amounts([]))).toBeUndefined()
  })

  it('judges a single debit by its amount', () => {
    expect(detectCadence(contract(), ['2026-09'], amounts([['2026-09', 44.99]]))).toBe('monthly')
    const yearlyContract = contract({ monthlyCost: 11.88, yearlyCost: 142.5 })
    expect(detectCadence(yearlyContract, ['2026-03'], amounts([['2026-03', 142.5]]))).toBe('yearly')
    expect(detectCadence(contract(), ['2026-09'], amounts([['2026-09', 250]]))).toBe('irregular')
  })
})

describe('buildContractComparison', () => {
  it('compares each month with the Soll and names deviations', () => {
    const comparison = buildContractComparison(contract(), input([debit('2026-07'), debit('2026-08', -44.99), debit('2026-09')]))
    expect(comparison.cadence).toBe('monthly')
    expect(comparison.months.map((entry) => [entry.month, entry.status, entry.expected, entry.actual])).toEqual([
      ['2026-09', 'ok', 39.99, 39.99],
      ['2026-08', 'deviation', 39.99, 44.99],
      ['2026-07', 'ok', 39.99, 39.99],
    ])
    expect(comparison.deviationCount).toBe(1)
  })

  it('reports a missing debit only in a fully imported month after the first debit', () => {
    const comparison = buildContractComparison(contract(), input([debit('2026-05'), debit('2026-06'), debit('2026-08')]))
    expect(comparison.months.map((entry) => [entry.month, entry.status])).toEqual([
      ['2026-09', 'missing'],
      ['2026-08', 'ok'],
      ['2026-07', 'missing'],
      ['2026-06', 'ok'],
      ['2026-05', 'ok'],
    ])
    expect(comparison.missingCount).toBe(2)
  })

  it('makes no claim about months that are not completely imported', () => {
    const partial = input([debit('2026-07'), debit('2026-08')], [{ accountId: 'giro', periodFrom: '2026-07-01', periodTo: '2026-09-20' }])
    const comparison = buildContractComparison(contract(), partial)
    expect(comparison.months.map((entry) => entry.month)).toEqual(['2026-08', '2026-07'])
    expect(comparison.missingCount).toBe(0)
  })

  it('stops expecting debits after the contract ended', () => {
    const ended = contract({ endDate: '2026-07-31' })
    const comparison = buildContractComparison(ended, input([debit('2026-06'), debit('2026-07')]))
    expect(comparison.months.map((entry) => entry.month)).toEqual(['2026-07', '2026-06'])
  })

  it('nets a returned debit against the month', () => {
    const comparison = buildContractComparison(contract(), input([debit('2026-08'), debit('2026-09'), debit('2026-09', 39.99, { isReversal: true })]))
    expect(comparison.months[0]).toMatchObject({ month: '2026-09', actual: 0, status: 'deviation', bookingCount: 2 })
  })

  it('compares a yearly contract with the yearly amount', () => {
    const yearly = contract({ monthlyCost: 11.88, yearlyCost: 142.5 })
    const comparison = buildContractComparison(yearly, input([debit('2025-10', -142.5), debit('2026-10', -149)]))
    expect(comparison.cadence).toBe('yearly')
    expect(comparison.months.map((entry) => [entry.month, entry.status, entry.expected])).toEqual([
      ['2026-10', 'deviation', 142.5],
      ['2025-10', 'ok', 142.5],
    ])
  })

  it('shows irregular debits without a Soll', () => {
    const comparison = buildContractComparison(contract(), input([debit('2026-01', -80), debit('2026-05', -60)]))
    expect(comparison.cadence).toBe('irregular')
    expect(comparison.months.every((entry) => entry.status === 'info' && entry.expected === undefined)).toBe(true)
  })

  it('has no comparison without linked bookings', () => {
    const comparison = buildContractComparison(contract(), input([tx({ bookingDate: '2026-09-15' })]))
    expect(comparison).toMatchObject({ cadence: undefined, months: [], bookings: [] })
  })
})

describe('buildFixedCostOverview', () => {
  const internet = contract()
  const power = contract({ id: 'c2', provider: 'Stadtwerke', monthlyCost: 85, yearlyCost: 1020, categoryId: 'electricity' })
  const gym = contract({ id: 'c3', provider: 'Fitness', monthlyCost: 30, yearlyCost: 360 })
  const future = contract({ id: 'c4', provider: 'Neu', monthlyCost: 10, startDate: '2026-12-01' })
  const transactions = [
    debit('2026-08'),
    debit('2026-09', -44.99),
    debit('2026-07', -85, { contractId: 'c2' }),
    debit('2026-08', -85, { contractId: 'c2' }),
    tx({ bookingDate: '2026-09-03', amount: -120 }),
  ]

  it('sums Soll of active contracts and Ist of linked debits separately', () => {
    const overview = buildFixedCostOverview([internet, power, gym, future], '2026-09', input(transactions))
    expect(overview.rows.map((row) => [row.contract.provider, row.status, row.expected, row.actual])).toEqual([
      ['Fitness', 'unlinked', 30, 0],
      ['Stadtwerke', 'missing', 85, 0],
      ['Telekom', 'deviation', 39.99, 44.99],
    ])
    expect(overview).toMatchObject({ expectedTotal: 154.99, actualTotal: 44.99, unlinkedCount: 1, missingCount: 1, deviationCount: 1, monthCovered: true })
  })

  it('only counts debits of linked bookings - other expenses never enter Ist', () => {
    const overview = buildFixedCostOverview([internet], '2026-09', input(transactions))
    expect(overview.actualTotal).toBe(44.99)
  })

  it('a yearly contract without a debit this month is not missing', () => {
    const yearly = contract({ monthlyCost: 11.88, yearlyCost: 142.5 })
    const overview = buildFixedCostOverview([yearly], '2026-09', input([debit('2026-03', -142.5)]))
    expect(overview.rows[0]).toMatchObject({ status: 'yearly_not_due', expected: 11.88, actual: 0 })
    const inMarch = buildFixedCostOverview([yearly], '2026-03', input([debit('2026-03', -142.5)]))
    expect(inMarch.rows[0]).toMatchObject({ status: 'ok', actual: 142.5, debitExpected: 142.5 })
  })

  it('offers imported months and defaults to the newest fully imported one', () => {
    const data = input(transactions, [{ accountId: 'giro', periodFrom: '2026-07-01', periodTo: '2026-09-20' }])
    expect(fixedCostMonths(data)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(defaultFixedCostMonth(data)).toBe('2026-08')
    expect(defaultFixedCostMonth({ transactions: [], coveredMonths: new Map(), currentMonth: '2026-10' })).toBe('2026-10')
  })
})

describe('contract link suggestions', () => {
  it('prefers mandate reference, then creditor id, then the name', () => {
    expect(linkDraftFor(tx({ mandateReference: 'M-1', creditorId: 'DE00ZZZ1' }))).toEqual({ field: 'mandateReference', matchType: 'equals', pattern: 'M-1' })
    expect(linkDraftFor(tx({ creditorId: 'DE00ZZZ1' }))?.field).toBe('creditorId')
    expect(linkDraftFor(tx({ counterpartyName: ' Telekom GmbH ' }))).toEqual({ field: 'counterpartyName', matchType: 'equals', pattern: 'Telekom GmbH' })
  })

  it('suggests groups by provider name and by recurring amount, best first', () => {
    const transactions = [
      tx({ bookingDate: '2026-08-15', counterpartyName: 'Telekom Deutschland GmbH', mandateReference: 'M-7', amount: -39.99 }),
      tx({ bookingDate: '2026-09-15', counterpartyName: 'Telekom Deutschland GmbH', mandateReference: 'M-7', amount: -39.99 }),
      tx({ bookingDate: '2026-09-02', counterpartyName: 'Telekom Shop', amount: -199 }),
      tx({ bookingDate: '2026-07-10', counterpartyName: 'Fitnessstudio', creditorId: 'DE00ZZZ9', amount: -38 }),
      tx({ bookingDate: '2026-08-10', counterpartyName: 'Fitnessstudio', creditorId: 'DE00ZZZ9', amount: -38 }),
      tx({ bookingDate: '2026-09-11', counterpartyName: 'Rewe', amount: -40 }),
    ]
    const suggestions = suggestContractLinks(contract(), transactions, [])
    expect(suggestions.map((entry) => [entry.counterpartyName, entry.basis, entry.bookingCount])).toEqual([
      ['Telekom Deutschland GmbH', 'name_and_amount', 2],
      ['Telekom Shop', 'name', 1],
      ['Fitnessstudio', 'amount', 2],
    ])
    expect(suggestions[0]?.description).toBe('Mandatsreferenz ist „M-7“')
  })

  it('never suggests income, card statements or bookings linked to another contract', () => {
    const other = contract({ id: 'c2', provider: 'Andere' })
    const transactions = [
      tx({ counterpartyName: 'Telekom', amount: 39.99, flowType: 'income' }),
      tx({ counterpartyName: 'Telekom', categoryId: 'credit_card_unitemized' }),
      tx({ counterpartyName: 'Telekom', contractId: 'c2' }),
    ]
    expect(suggestContractLinks(contract(), transactions, [other])).toEqual([])
    // A link to a contract that no longer exists does not block a suggestion.
    expect(suggestContractLinks(contract(), [tx({ counterpartyName: 'Telekom', contractId: 'gone' })], [other])).toHaveLength(1)
  })

  it('ignores legal-form words of the provider name', () => {
    expect(suggestContractLinks(contract({ provider: 'Muster GmbH' }), [tx({ counterpartyName: 'Andere GmbH', amount: -5 })], [])).toEqual([])
  })
})

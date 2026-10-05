// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { deleteDatabase } from '../database/database'
import type { ImportBatch, Transaction } from '../domain/models/entities'
import { commitImport, prepareImport } from '../domain/usecases/bankImport/importTransactions'
import {
  buildDailySeries,
  buildFinanceOverview,
  compareWithPreviousMonth,
  expensesByGroup,
  getFinanceData,
  isMonthComplete,
  recentTransactions,
  sumFlows,
} from '../domain/usecases/finance/monthlyOverview'

let nextId = 0
function tx(overrides: Partial<Transaction>): Transaction {
  nextId += 1
  return {
    id: `t${String(nextId).padStart(3, '0')}`,
    accountId: 'giro',
    bookingDate: '2026-08-10',
    amount: -10,
    currency: 'EUR',
    counterpartyName: '',
    purpose: '',
    bookingText: '',
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

function batch(periodFrom: string, periodTo: string, accountId = 'giro'): ImportBatch {
  return {
    id: `${accountId}-${periodFrom}`,
    accountId,
    filename: 'x.csv',
    fileChecksum: '',
    importedAt: '',
    periodFrom,
    periodTo,
    counts: { total: 0, new: 0, duplicates: 0, skippedPending: 0 },
    createdAt: '',
    updatedAt: '',
  }
}

describe('sumFlows (O-5)', () => {
  it('Saldo = Einnahmen − Ausgaben − Gespart; transfers count nowhere', () => {
    const totals = sumFlows([
      tx({ amount: 3000, flowType: 'income' }),
      tx({ amount: -2000, flowType: 'expense' }),
      tx({ amount: -500, flowType: 'saving' }),
      tx({ amount: -800, flowType: 'transfer' }),
      tx({ amount: 800, flowType: 'transfer' }),
    ])
    expect(totals).toEqual({ income: 3000, expenses: 2000, saved: 500, balance: 500 })
  })

  it('a refund lowers the expenses and money flowing back lowers the savings', () => {
    const totals = sumFlows([
      tx({ amount: -100, flowType: 'expense' }),
      tx({ amount: 30, flowType: 'expense', isReversal: true }),
      tx({ amount: -200, flowType: 'saving' }),
      tx({ amount: 76.36, flowType: 'saving' }),
    ])
    expect(totals).toEqual({ income: 0, expenses: 70, saved: 123.64, balance: -193.64 })
  })
})

describe('compareWithPreviousMonth', () => {
  const july = [tx({ bookingDate: '2026-07-01', amount: 2000, flowType: 'income' }), tx({ bookingDate: '2026-07-05', amount: -1000 })]
  const august = [tx({ bookingDate: '2026-08-01', amount: 2500, flowType: 'income' }), tx({ bookingDate: '2026-08-05', amount: -900 })]

  it('compares income and expenses in percent and Saldo in euros', () => {
    const comparison = compareWithPreviousMonth('2026-08', [...july, ...august], [batch('2026-07-01', '2026-08-31')])
    expect(comparison.incomePercent).toBe(25)
    expect(comparison.expensesPercent).toBe(-10)
    expect(comparison.balanceDifference).toBe(600)
    expect(comparison.unavailableReason).toBeUndefined()
  })

  it('does not compare with a missing or incompletely imported month', () => {
    expect(compareWithPreviousMonth('2026-08', august, [batch('2026-07-01', '2026-08-31')]).unavailableReason).toBe('no_previous_month')
    const partial = compareWithPreviousMonth('2026-08', [...july, ...august], [batch('2026-07-01', '2026-08-20')])
    expect(partial).toEqual({ unavailableReason: 'incomplete' })
  })

  it('has no percentage when the previous value was 0', () => {
    const noIncome = [tx({ bookingDate: '2026-07-05', amount: -10 }), ...august]
    expect(compareWithPreviousMonth('2026-08', noIncome, [batch('2026-07-01', '2026-08-31')]).incomePercent).toBeNull()
  })

  it('a month is complete only when every account with bookings covers it', () => {
    const both = [...august, tx({ accountId: 'card', bookingDate: '2026-08-12' })]
    expect(isMonthComplete('2026-08', both, [batch('2026-08-01', '2026-08-31')])).toBe(false)
    expect(isMonthComplete('2026-08', both, [batch('2026-08-01', '2026-08-31'), batch('2026-07-20', '2026-09-02', 'card')])).toBe(true)
  })
})

describe('buildDailySeries', () => {
  it('has a point for every day with real values and running totals', () => {
    const series = buildDailySeries(
      [tx({ bookingDate: '2026-02-03', amount: -20 }), tx({ bookingDate: '2026-02-03', amount: -5 }), tx({ bookingDate: '2026-02-27', amount: 100, flowType: 'income' })],
      '2026-02',
      '2026-10-05',
    )
    expect(series).toHaveLength(28)
    expect(series[2]).toEqual({ date: '2026-02-03', income: 0, expenses: 25, cumulativeIncome: 0, cumulativeExpenses: 25 })
    expect(series[3]).toMatchObject({ expenses: 0, cumulativeExpenses: 25 })
    expect(series[27]).toMatchObject({ cumulativeIncome: 100, cumulativeExpenses: 25 })
  })

  it('ends today in the current month', () => {
    expect(buildDailySeries([], '2026-10', '2026-10-05')).toHaveLength(5)
  })
})

describe('expensesByGroup', () => {
  it('rolls categories up into their group, keeps the largest and combines the rest', () => {
    const transactions = [
      tx({ amount: -500, categoryId: 'heating' }),
      tx({ amount: -250, categoryId: 'housing' }),
      tx({ amount: -400, categoryId: 'groceries' }),
      tx({ amount: -300, categoryId: 'mobility' }),
      tx({ amount: -200, categoryId: 'leisure' }),
      tx({ amount: -100 }),
      tx({ amount: -60, categoryId: 'health' }),
      tx({ amount: -40, categoryId: 'clothing' }),
      tx({ amount: 1000, flowType: 'income', categoryId: 'salary' }),
    ]
    const groups = expensesByGroup(transactions, DEFAULT_CATEGORIES)
    expect(groups.map((group) => [group.groupId, group.name, group.amount])).toEqual([
      ['housing', 'Wohnen', 750],
      ['groceries', 'Lebensmittel', 400],
      ['mobility', 'Mobilität', 300],
      ['leisure', 'Freizeit', 200],
      ['none', 'Ohne Kategorie', 100],
      ['more', 'Weitere', 100],
    ])
    expect(groups.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1)
  })

  it('does not combine a single remaining group and leaves out net refunds', () => {
    const groups = expensesByGroup([tx({ amount: -10, categoryId: 'health' }), tx({ amount: 20, categoryId: 'clothing', isReversal: true })], DEFAULT_CATEGORIES, 0)
    expect(groups.map((group) => group.groupId)).toEqual(['health'])
  })
})

describe('recentTransactions', () => {
  it('lists the newest bookings with their category', () => {
    const recent = recentTransactions([tx({ bookingDate: '2026-08-01' }), tx({ bookingDate: '2026-08-20', categoryId: 'groceries' })], DEFAULT_CATEGORIES, 1)
    expect(recent.map((entry) => [entry.transaction.bookingDate, entry.category?.name])).toEqual([['2026-08-20', 'Lebensmittel']])
  })
})

describe('dashboard figures from the Sparkasse fixtures', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  async function importFixture(name: string): Promise<void> {
    const result = await prepareImport(new File([readFileSync(new URL(`./fixtures/sparkasse/${name}`, import.meta.url))], name))
    if (!result.ok) throw new Error(result.error)
    await commitImport(result.preview)
  }

  it('every figure can be recomputed from the bookings', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    await importFixture('sparkasse-kreditkarte-sample.csv')
    const data = await getFinanceData()
    expect(data.defaultMonth).toBe('2026-09')

    const overview = buildFinanceOverview(data, '2026-08', '2026-10-05')
    const august = data.transactions.filter((entry) => entry.bookingDate.startsWith('2026-08'))
    const sum = (flow: Transaction['flowType']) => Math.round(august.filter((entry) => entry.flowType === flow).reduce((total, entry) => total + entry.amount, 0) * 100) / 100

    expect(overview.totals.income).toBe(sum('income'))
    expect(overview.totals.expenses).toBe(-sum('expense'))
    expect(overview.totals.saved).toBe(-sum('saving'))
    expect(overview.totals.balance).toBe(Math.round((sum('income') + sum('expense') + sum('saving')) * 100) / 100)
    expect(overview.daily.at(-1)).toMatchObject({ cumulativeIncome: overview.totals.income, cumulativeExpenses: overview.totals.expenses })
    expect(overview.groups.reduce((total, group) => total + group.amount, 0)).toBeCloseTo(overview.totals.expenses, 2)
    expect(overview.transactionCount).toBe(august.length)
    // The card export starts mid-July, so August is complete but July is not.
    expect(overview.complete).toBe(true)
    expect(overview.comparison.unavailableReason).toBe('incomplete')
  })
})

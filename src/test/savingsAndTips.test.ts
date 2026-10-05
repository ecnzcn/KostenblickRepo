// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { deleteDatabase, getDatabase } from '../database/database'
import { STORE_NAMES } from '../database/schema'
import type { Contract, ImportBatch, Transaction } from '../domain/models/entities'
import type { FinanceData } from '../domain/usecases/finance/monthlyOverview'
import { getFinanceData, sumFlows } from '../domain/usecases/finance/monthlyOverview'
import {
  calculateSavingsProgress,
  getSavingsGoal,
  removeSavingsGoal,
  saveSavingsGoal,
  validateSavingsTarget,
} from '../domain/usecases/finance/savingsGoal'
import { buildTips } from '../domain/usecases/finance/tips'

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
    categorySource: 'rule',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'b',
    dedupeKey: `k${nextId}`,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const fullBatch: ImportBatch = {
  id: 'b',
  accountId: 'giro',
  filename: 'giro.csv',
  fileChecksum: '',
  importedAt: '',
  periodFrom: '2026-07-01',
  periodTo: '2026-08-31',
  counts: { total: 0, new: 0, duplicates: 0, skippedPending: 0 },
  createdAt: '',
  updatedAt: '',
}

function contract(overrides: Partial<Contract>): Contract {
  return {
    id: 'c1',
    userId: 'local-user',
    categoryId: 'telecom',
    provider: 'Telekom',
    monthlyCost: 39.99,
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

function data(transactions: Transaction[], extra: Partial<FinanceData> = {}): FinanceData {
  return { transactions, categories: DEFAULT_CATEGORIES, batches: [fullBatch], contracts: [], months: [], ...extra }
}

const links = { transactions: (query: string) => `/buchungen?${query}`, contract: (id: string) => `/vertraege/${id}` }

describe('savings goal (E5/O-5)', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('progress = (Saldo + Gespart) / Ziel, clamped to 0-100 %', () => {
    // Einnahmen 3.000, Ausgaben 2.000, Gespart 500 → Saldo 500, (500 + 500) / 2.000 = 50 %
    const totals = sumFlows([tx({ amount: 3000, flowType: 'income' }), tx({ amount: -2000 }), tx({ amount: -500, flowType: 'saving' })])
    expect(calculateSavingsProgress(totals, 2000)).toEqual({ target: 2000, achieved: 1000, ratio: 0.5, percent: 50, reached: false, negative: false })
    expect(calculateSavingsProgress(totals, 800)).toMatchObject({ ratio: 1, percent: 100, reached: true })
    expect(calculateSavingsProgress(totals, 1004).percent).toBe(99)
  })

  it('a negative month is 0 % and marked as such', () => {
    const totals = sumFlows([tx({ amount: 1000, flowType: 'income' }), tx({ amount: -1200 })])
    expect(calculateSavingsProgress(totals, 500)).toMatchObject({ achieved: -200, ratio: 0, percent: 0, negative: true, reached: false })
  })

  it('validates the target', () => {
    expect(validateSavingsTarget(null)).toMatch(/Betrag/)
    expect(validateSavingsTarget(0)).toMatch(/größer als 0/)
    expect(validateSavingsTarget(-5)).toMatch(/größer als 0/)
    expect(validateSavingsTarget(2_000_000)).toMatch(/unplausibel/)
    expect(validateSavingsTarget(450.5)).toBeNull()
  })

  it('stores one goal locally, updates it in place and removes it - no sync queue entry', async () => {
    const first = await saveSavingsGoal(500, new Date('2026-09-01T00:00:00Z'))
    const second = await saveSavingsGoal(600.005, new Date('2026-09-02T00:00:00Z'))
    expect(second).toMatchObject({ id: first.id, monthlyTarget: 600.01, createdAt: first.createdAt })
    expect((await getFinanceData()).savingsGoal?.monthlyTarget).toBe(600.01)
    const db = await getDatabase()
    expect(await db.getAll(STORE_NAMES.savingsGoals)).toHaveLength(1)
    expect(await db.getAll(STORE_NAMES.syncQueue)).toEqual([])

    await expect(saveSavingsGoal(0)).rejects.toThrow('größer als 0')
    await removeSavingsGoal()
    expect(await getSavingsGoal()).toBeUndefined()
  })
})

describe('buildTips', () => {
  it('gives no tip without a data basis', () => {
    expect(buildTips(data([]), '2026-08', '2026-10-05', links)).toEqual([])
    const tidy = [tx({ bookingDate: '2026-08-01', amount: 2000, flowType: 'income', categoryId: 'salary' }), tx({ bookingDate: '2026-08-03', categoryId: 'groceries' })]
    expect(buildTips(data(tidy), '2026-08', '2026-10-05', links)).toEqual([])
  })

  it('names bookings without category with a link to them', () => {
    const [tip] = buildTips(data([tx({}), tx({}), tx({ amount: 5, flowType: 'transfer' })]), '2026-08', '2026-10-05', links)
    expect(tip).toMatchObject({ kind: 'uncategorized', link: { to: '/buchungen?monat=2026-08&kategorie=ohne' } })
    expect(tip?.text).toBe('2 Buchungen sind im August 2026 noch ohne Kategorie. Ordne sie zu, damit „Ausgaben nach Kategorie“ stimmt.')
  })

  it('names the largest category change against a complete previous month', () => {
    const transactions = [
      tx({ bookingDate: '2026-07-05', amount: -200, categoryId: 'leisure' }),
      tx({ bookingDate: '2026-07-06', amount: -100, categoryId: 'groceries' }),
      tx({ bookingDate: '2026-08-05', amount: -176, categoryId: 'leisure' }),
      tx({ bookingDate: '2026-08-06', amount: -105, categoryId: 'groceries' }),
    ]
    const tips = buildTips(data(transactions), '2026-08', '2026-10-05', links)
    expect(tips).toHaveLength(1)
    expect(tips[0]?.text).toBe('Du hast im August 2026 12 % weniger für Freizeit ausgegeben als im Juli 2026 (176,00 € statt 200,00 €).'.replace(/ €/g, ' €'))
    // Groceries +5 % / +5 € stays below both thresholds.
    // Without a complete previous month there is no comparison tip.
    expect(buildTips(data(transactions, { batches: [{ ...fullBatch, periodFrom: '2026-07-10' }] }), '2026-08', '2026-10-05', links)).toEqual([])
  })

  it('names contract debits that differ from the contract or are missing', () => {
    const transactions = [
      tx({ bookingDate: '2026-07-15', amount: -39.99, contractId: 'c1', categoryId: 'telecom' }),
      tx({ bookingDate: '2026-08-15', amount: -44.99, contractId: 'c1', categoryId: 'telecom' }),
      tx({ bookingDate: '2026-07-20', amount: -85, contractId: 'c2', categoryId: 'electricity' }),
    ]
    const contracts = [contract({}), contract({ id: 'c2', provider: 'Stadtwerke', monthlyCost: 85, categoryId: 'electricity' })]
    const tips = buildTips(data(transactions, { contracts }), '2026-08', '2026-10-05', links)
    // Contract tips in provider order; the missing power debit also lowers "Wohnen".
    expect(tips.map((tip) => tip.kind)).toEqual(['contract_missing', 'contract_deviation', 'category_change'])
    expect(tips[0]?.text).toContain('Für Stadtwerke gibt es im August 2026 keine Abbuchung')
    expect(tips[1]?.text).toContain('Telekom wurde im August 2026 teurer abgebucht als im Vertrag hinterlegt')
    expect(tips[1]?.link?.to).toBe('/vertraege/c1')
    expect(tips[2]?.text).toContain('100 % weniger für Wohnen')
  })

  it('puts a missing card export first', () => {
    const transactions = [
      tx({ bookingDate: '2026-08-18', amount: -500, bookingText: 'EIGENE KREDITKARTENABRECHN.', flowType: 'transfer' }),
      tx({}),
    ]
    const tips = buildTips(data(transactions), '2026-08', '2026-10-05', links)
    expect(tips.map((tip) => tip.kind)).toEqual(['missing_card_export', 'uncategorized'])
  })
})

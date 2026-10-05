import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../../constants/categories'
import type { Transaction } from '../../domain/models/entities'
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterCategoryOptions,
  filterTransactions,
  filtersFromParams,
  filtersToParams,
  isFiltered,
} from './transactionFilters'

function tx(id: string, overrides: Partial<Transaction>): Transaction {
  return {
    id,
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
    dedupeKey: id,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const categoriesById = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]))
const transactions = [
  tx('rent', { bookingDate: '2026-08-01', amount: -750, counterpartyName: 'Vermieter', categoryId: 'housing' }),
  tx('power', { bookingDate: '2026-08-15', amount: -85.33, counterpartyName: 'Stadtwerke', categoryId: 'electricity' }),
  tx('food', { bookingDate: '2026-07-20', amount: -48.32, counterpartyName: 'Edeka', purpose: 'Einkauf Markt 12', categoryId: 'groceries' }),
  tx('salary', { bookingDate: '2026-08-01', amount: 2850, counterpartyName: 'Arbeitgeber', flowType: 'income', categoryId: 'salary' }),
  tx('open', { bookingDate: '2026-08-20', amount: -12 }),
  tx('card', { bookingDate: '2026-08-18', amount: -500, flowType: 'transfer' }),
]

const ids = (filters: Partial<typeof DEFAULT_TRANSACTION_FILTERS>) =>
  filterTransactions(transactions, categoriesById, { ...DEFAULT_TRANSACTION_FILTERS, ...filters }).map((entry) => entry.id)

describe('filterTransactions', () => {
  it('lists everything newest first without filters', () => {
    expect(ids({})).toEqual(['open', 'card', 'power', 'rent', 'salary', 'food'])
  })

  it('filters by month, flow and category; a group includes its categories', () => {
    expect(ids({ month: '2026-07' })).toEqual(['food'])
    expect(ids({ flow: 'income' })).toEqual(['salary'])
    expect(ids({ category: 'housing' })).toEqual(['power', 'rent'])
    expect(ids({ category: 'electricity' })).toEqual(['power'])
    // "Ohne Kategorie" means income/expense without category - not a transfer.
    expect(ids({ category: 'ohne' })).toEqual(['open'])
  })

  it('searches name, purpose, category and amount, ignoring case', () => {
    expect(ids({ search: 'edeka' })).toEqual(['food'])
    expect(ids({ search: 'markt 12' })).toEqual(['food'])
    expect(ids({ search: 'strom' })).toEqual(['power'])
    expect(ids({ search: '85,33' })).toEqual(['power'])
    expect(ids({ search: 'edeka', month: '2026-08' })).toEqual([])
  })
})

describe('filters in the URL', () => {
  it('round-trips and leaves defaults out', () => {
    const filters = { search: 'Edeka', month: '2026-08', category: 'ohne', flow: 'expense' as const }
    const params = filtersToParams(filters)
    expect(params.toString()).toBe('monat=2026-08&kategorie=ohne&art=ausgaben&suche=Edeka')
    expect(filtersFromParams(params)).toEqual(filters)
    expect(filtersToParams(DEFAULT_TRANSACTION_FILTERS).toString()).toBe('')
    expect(isFiltered(DEFAULT_TRANSACTION_FILTERS)).toBe(false)
  })

  it('ignores invalid values', () => {
    expect(filtersFromParams(new URLSearchParams('monat=bad&art=foo'))).toEqual(DEFAULT_TRANSACTION_FILTERS)
  })
})

describe('filterCategoryOptions', () => {
  it('offers used categories and their groups, by name', () => {
    expect(filterCategoryOptions(transactions, DEFAULT_CATEGORIES).map((category) => category.id)).toEqual(['salary', 'groceries', 'electricity', 'housing'])
  })
})

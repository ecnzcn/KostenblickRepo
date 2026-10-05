import type { Category, FlowType, Transaction } from '../../domain/models/entities'
import { formatCurrency } from '../../utils/formatters'

/**
 * Phase 14G: search and filters of the booking list - pure functions over
 * the already loaded bookings (same pattern as contractFilters.ts), so
 * typing or switching a filter never reads IndexedDB again. The filters
 * live in the URL (?monat=…&kategorie=…&art=…&suche=…), so the dashboard
 * can link to a filtered list and "back" from a booking keeps them.
 */

export type FlowFilter = FlowType | 'all'
/** A category id (also matches the categories of that group), 'none' for
 * bookings without category, or 'all'. */
export type CategoryFilter = string

export interface TransactionFilters {
  search: string
  month: string
  category: CategoryFilter
  flow: FlowFilter
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = { search: '', month: 'all', category: 'all', flow: 'all' }

export const UNCATEGORIZED_FILTER = 'ohne'

const FLOW_PARAM: Record<FlowType, string> = {
  income: 'einnahmen',
  expense: 'ausgaben',
  saving: 'sparen',
  transfer: 'umbuchungen',
}

export function filtersFromParams(params: URLSearchParams): TransactionFilters {
  const flow = (Object.entries(FLOW_PARAM).find(([, value]) => value === params.get('art'))?.[0] ?? 'all') as FlowFilter
  const month = params.get('monat') ?? ''
  return {
    search: params.get('suche') ?? '',
    month: /^\d{4}-\d{2}$/.test(month) ? month : 'all',
    category: params.get('kategorie') || 'all',
    flow,
  }
}

export function filtersToParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.month !== 'all') params.set('monat', filters.month)
  if (filters.category !== 'all') params.set('kategorie', filters.category)
  if (filters.flow !== 'all') params.set('art', FLOW_PARAM[filters.flow])
  if (filters.search.trim()) params.set('suche', filters.search)
  return params
}

export function isFiltered(filters: TransactionFilters): boolean {
  return filtersToParams(filters).toString() !== ''
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim()
}

function matchesCategory(transaction: Transaction, filter: CategoryFilter, categoriesById: ReadonlyMap<string, Category>): boolean {
  if (filter === 'all') return true
  if (filter === UNCATEGORIZED_FILTER) return !transaction.categoryId && (transaction.flowType === 'income' || transaction.flowType === 'expense')
  if (!transaction.categoryId) return false
  return transaction.categoryId === filter || categoriesById.get(transaction.categoryId)?.group === filter
}

function matchesSearch(transaction: Transaction, search: string, categoriesById: ReadonlyMap<string, Category>): boolean {
  const query = normalize(search)
  if (!query) return true
  const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : undefined
  const haystack = [
    transaction.counterpartyName,
    transaction.purpose,
    transaction.bookingText,
    category?.name ?? '',
    formatCurrency(transaction.amount),
    formatCurrency(Math.abs(transaction.amount)),
  ]
  return haystack.some((value) => normalize(value).includes(query))
}

/** Filtered bookings, newest first. */
export function filterTransactions(
  transactions: readonly Transaction[],
  categoriesById: ReadonlyMap<string, Category>,
  filters: TransactionFilters,
): Transaction[] {
  return transactions
    .filter(
      (transaction) =>
        (filters.month === 'all' || transaction.bookingDate.startsWith(filters.month)) &&
        (filters.flow === 'all' || transaction.flowType === filters.flow) &&
        matchesCategory(transaction, filters.category, categoriesById) &&
        matchesSearch(transaction, filters.search, categoriesById),
    )
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

/** Categories offered in the filter: those used by bookings plus their
 * groups, sorted by name. */
export function filterCategoryOptions(transactions: readonly Transaction[], categories: readonly Category[]): Category[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const ids = new Set<string>()
  for (const transaction of transactions) {
    if (!transaction.categoryId) continue
    ids.add(transaction.categoryId)
    const group = byId.get(transaction.categoryId)?.group
    if (group) ids.add(group)
  }
  return [...ids]
    .map((id) => byId.get(id))
    .filter((category): category is Category => category !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

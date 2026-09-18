import type { Bill } from '../../domain/models/entities'
import { BILL_TYPE_LABELS } from '../../domain/usecases/bills'
import { formatCurrency } from '../../utils/formatters'

export type BillYearFilter = number | 'all'
export type BillSort = 'year_desc' | 'year_asc' | 'amount_desc' | 'amount_asc' | 'created_desc'

export interface BillFilterOptions {
  search: string
  yearFilter: BillYearFilter
  sort: BillSort
}

/** Matches the existing listBills() default order (newest year first, then
 * newest created first) so turning the new controls on never reorders an
 * unfiltered list by surprise. */
export const DEFAULT_BILL_FILTERS: BillFilterOptions = {
  search: '',
  yearFilter: 'all',
  sort: 'year_desc',
}

function matchesSearch(bill: Bill, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    String(bill.year).includes(needle) ||
    BILL_TYPE_LABELS[bill.type].toLowerCase().includes(needle) ||
    String(bill.totalAmount).includes(needle) ||
    formatCurrency(bill.totalAmount).toLowerCase().includes(needle)
  )
}

/** Deterministic tiebreaker for equal primary sort values - newest created
 * first, then id as a final, always-unique fallback. */
function tiebreak(a: Bill, b: Bill): number {
  const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  if (created !== 0) return created
  return a.id.localeCompare(b.id)
}

const SORTERS: Record<BillSort, (a: Bill, b: Bill) => number> = {
  year_desc: (a, b) => b.year - a.year || tiebreak(a, b),
  year_asc: (a, b) => a.year - b.year || tiebreak(a, b),
  amount_desc: (a, b) => b.totalAmount - a.totalAmount || tiebreak(a, b),
  amount_asc: (a, b) => a.totalAmount - b.totalAmount || tiebreak(a, b),
  created_desc: (a, b) => tiebreak(a, b),
}

/** Every year with at least one Bill, descending - the basis for the year
 * filter on /abrechnungen. */
export function getBillYears(bills: Bill[]): number[] {
  return [...new Set(bills.map((bill) => bill.year))].sort((a, b) => b - a)
}

/** Pure search/filter/sort over an already-loaded Bill list (see
 * documentFilters.ts for the same shape) - no IndexedDB access happens
 * here, so typing in the search box or switching year/sort stays instant.
 * Never searches BillItems - that would require an additional join/load
 * this page doesn't otherwise need. */
export function filterAndSortBills(bills: Bill[], options: BillFilterOptions): Bill[] {
  const filtered = bills.filter((bill) => {
    if (options.yearFilter !== 'all' && bill.year !== options.yearFilter) return false
    return matchesSearch(bill, options.search)
  })
  return [...filtered].sort(SORTERS[options.sort])
}

import type { Category, CostEntry } from '../../domain/models/entities'
import { formatCurrency } from '../../utils/formatters'

export type CostSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export interface CostFilterOptions {
  search: string
  sort: CostSort
}

/** Matches listCostEntries()'s default order (newest date first) so turning
 * the new controls on never reorders an unfiltered list by surprise. */
export const DEFAULT_COST_FILTERS: CostFilterOptions = {
  search: '',
  sort: 'date_desc',
}

function matchesSearch(entry: CostEntry, category: Category | undefined, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    (entry.notes?.toLowerCase().includes(needle) ?? false) ||
    (category?.name.toLowerCase().includes(needle) ?? false) ||
    String(entry.amount).includes(needle) ||
    formatCurrency(entry.amount).toLowerCase().includes(needle)
  )
}

/** Deterministic tiebreaker for equal primary sort values - newest created
 * first, then id as a final, always-unique fallback (same shape as
 * billFilters.ts's tiebreak). */
function tiebreak(a: CostEntry, b: CostEntry): number {
  const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  if (created !== 0) return created
  return a.id.localeCompare(b.id)
}

const SORTERS: Record<CostSort, (a: CostEntry, b: CostEntry) => number> = {
  date_desc: (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || tiebreak(a, b),
  date_asc: (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || tiebreak(a, b),
  amount_desc: (a, b) => b.amount - a.amount || tiebreak(a, b),
  amount_asc: (a, b) => a.amount - b.amount || tiebreak(a, b),
}

/** Pure search/sort over an already year-filtered, already-loaded CostEntry
 * list (see billFilters.ts/documentFilters.ts for the same shape) - no
 * IndexedDB access happens here. Searches notes and the entry's category
 * name (via the already-loaded category map), plus the amount - the same
 * kind of fields Bills' search already covers. */
export function filterAndSortCostEntries(
  entries: CostEntry[],
  categoriesById: Map<string, Category>,
  options: CostFilterOptions,
): CostEntry[] {
  const filtered = entries.filter((entry) => matchesSearch(entry, categoriesById.get(entry.categoryId), options.search))
  return [...filtered].sort(SORTERS[options.sort])
}

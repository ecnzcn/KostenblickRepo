import type { Category, Contract } from '../../domain/models/entities'
import { isContractActive } from '../../domain/usecases/contracts'
import { daysUntil } from '../../utils/date'

export type ContractStatusFilter = 'all' | 'active' | 'inactive'
export type ContractReminderFilter = 'all' | 'enabled' | 'disabled'
/** Deliberately doesn't offer a separate "Kündigungsdatum auf-/absteigend"
 * sort - upcoming_deadline already is a cancellation-date-based sort (with
 * sensible end-of-list handling for contracts with none or an already-past
 * one); a second, subtly different date sort next to it would confuse
 * more than it would help (see Phase 12D's "Auswahl soll übersichtlich
 * bleiben"). */
export type ContractSort =
  | 'upcoming_deadline'
  | 'provider_asc'
  | 'provider_desc'
  | 'monthly_cost_desc'
  | 'monthly_cost_asc'
  | 'start_date_desc'
  | 'start_date_asc'

export interface ContractFilterOptions {
  search: string
  statusFilter: ContractStatusFilter
  /** A Category id, or 'all'. */
  categoryFilter: string
  reminderFilter: ContractReminderFilter
  sort: ContractSort
}

/** Matches the list's pre-existing default order (soonest cancellation
 * deadline first, see sortByUpcomingDeadline below) so turning the new
 * search/filter/sort controls on never reorders an unfiltered list by
 * surprise. */
export const DEFAULT_CONTRACT_FILTERS: ContractFilterOptions = {
  search: '',
  statusFilter: 'all',
  categoryFilter: 'all',
  reminderFilter: 'all',
  sort: 'upcoming_deadline',
}

function matchesSearch(contract: Contract, category: Category | undefined, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    contract.provider.toLowerCase().includes(needle) ||
    (contract.tariff?.toLowerCase().includes(needle) ?? false) ||
    (category?.name.toLowerCase().includes(needle) ?? false)
  )
}

/** Deterministic tiebreaker for equal primary sort values - same shape as
 * billFilters.ts/costFilters.ts's tiebreak (newest created first, then id
 * as a final, always-unique fallback), so two contracts with the same
 * provider/cost/date never visibly swap order between renders. */
function tiebreak(a: Contract, b: Contract): number {
  const created = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  if (created !== 0) return created
  return a.id.localeCompare(b.id)
}

/**
 * The list's pre-existing default order (previously computed inline in
 * useContracts.ts, moved here unchanged): contracts with a relevant
 * (today-or-later) cancellation deadline first, soonest first; everything
 * else (no deadline at all, or one that has already passed) after that,
 * alphabetically by provider.
 */
function sortByUpcomingDeadline(a: Contract, b: Contract, now: Date): number {
  const daysRemaining = (contract: Contract): number | undefined =>
    contract.calculatedCancellationDate ? daysUntil(contract.calculatedCancellationDate, now) : undefined
  const aDays = daysRemaining(a)
  const bDays = daysRemaining(b)
  const aRelevant = aDays !== undefined && aDays >= 0
  const bRelevant = bDays !== undefined && bDays >= 0
  if (aRelevant && bRelevant) return aDays - bDays
  if (aRelevant) return -1
  if (bRelevant) return 1
  return a.provider.localeCompare(b.provider)
}

function buildSorters(now: Date): Record<ContractSort, (a: Contract, b: Contract) => number> {
  return {
    upcoming_deadline: (a, b) => sortByUpcomingDeadline(a, b, now),
    provider_asc: (a, b) => a.provider.localeCompare(b.provider) || tiebreak(a, b),
    provider_desc: (a, b) => b.provider.localeCompare(a.provider) || tiebreak(a, b),
    monthly_cost_desc: (a, b) => b.monthlyCost - a.monthlyCost || tiebreak(a, b),
    monthly_cost_asc: (a, b) => a.monthlyCost - b.monthlyCost || tiebreak(a, b),
    start_date_desc: (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime() || tiebreak(a, b),
    start_date_asc: (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime() || tiebreak(a, b),
  }
}

/** Every category actually used by at least one contract, in the order
 * they appear in `categoriesById` - the basis for the category filter,
 * mirroring getBillYears()'s "only what's actually present" approach
 * rather than listing every generic (cost-only) category too. */
export function getContractCategoryIds(contracts: Contract[]): string[] {
  return [...new Set(contracts.map((contract) => contract.categoryId))]
}

/**
 * Pure search/filter/sort over an already-loaded Contract list (see
 * billFilters.ts/documentFilters.ts/costFilters.ts for the same shape) - no
 * IndexedDB access happens here, so typing in the search box or switching
 * a filter/sort stays instant. The status filter reuses the existing,
 * single isContractActive() definition rather than a second local notion
 * of "active".
 */
export function filterAndSortContracts(
  contracts: Contract[],
  categoriesById: Map<string, Category>,
  options: ContractFilterOptions,
  now: Date = new Date(),
): Contract[] {
  const filtered = contracts.filter((contract) => {
    if (options.statusFilter !== 'all') {
      const active = isContractActive(contract, now)
      if (options.statusFilter === 'active' && !active) return false
      if (options.statusFilter === 'inactive' && active) return false
    }
    if (options.categoryFilter !== 'all' && contract.categoryId !== options.categoryFilter) return false
    if (options.reminderFilter !== 'all') {
      if (options.reminderFilter === 'enabled' && !contract.reminderEnabled) return false
      if (options.reminderFilter === 'disabled' && contract.reminderEnabled) return false
    }
    return matchesSearch(contract, categoriesById.get(contract.categoryId), options.search)
  })
  return [...filtered].sort(buildSorters(now)[options.sort])
}

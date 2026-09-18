import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/EmptyState'
import { billDetailPath, costDetailPath, wasteDetailPath } from '../../../constants/navigation'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import type { CentralCostItem, CentralCostSource } from '../costOverview.types'

interface CostOverviewItemsListProps {
  items: CentralCostItem[]
  year: number
}

const SOURCE_LABELS: Record<CentralCostSource, string> = {
  bill: 'Abrechnung',
  waste: 'Müllkosten',
  manual: 'Manuell',
}

/** The only date signal each source is willing to stand behind for sorting -
 * a Bill without a fully-set period, or any WasteCost (year-only
 * granularity), never gets an invented date, matching the "no artificial
 * precision" rule already followed by the monthly chart and Statistics. */
function resolveSortDate(item: CentralCostItem): string | undefined {
  if (item.source === 'manual') return item.date
  if (item.source === 'bill') return item.periodEnd
  return undefined
}

/** Dated items first (most recent first), undated items after in their
 * original (stable) order - never sorted by a date that doesn't exist. */
function sortItemsForDisplay(items: CentralCostItem[]): CentralCostItem[] {
  return items
    .map((item, index) => ({ item, index, sortDate: resolveSortDate(item) }))
    .sort((a, b) => {
      if (a.sortDate && b.sortDate) return b.sortDate.localeCompare(a.sortDate)
      if (a.sortDate && !b.sortDate) return -1
      if (!a.sortDate && b.sortDate) return 1
      return a.index - b.index
    })
    .map((entry) => entry.item)
}

function itemDetailPath(item: CentralCostItem): string {
  if (item.source === 'bill') return billDetailPath(item.sourceEntityId)
  if (item.source === 'waste') return wasteDetailPath(item.sourceEntityId)
  return costDetailPath(item.sourceEntityId)
}

function itemDateLabel(item: CentralCostItem, year: number): string {
  if (item.source === 'manual' && item.date) return formatDate(item.date)
  if (item.source === 'bill' && item.periodStart && item.periodEnd) {
    return `${formatDate(item.periodStart)} – ${formatDate(item.periodEnd)}`
  }
  if (item.source === 'bill' && item.periodEnd) return formatDate(item.periodEnd)
  return `${year} · Kein Einzeldatum`
}

/** Pure presentation of the already-computed `CentralCostItem`s for one
 * year - no repository access, no aggregation, no amount recalculation.
 * Every row links straight to the existing Bill/WasteCost/CostEntry detail
 * page via the existing path builders, giving /kostenuebersicht the
 * drill-down its category/monthly charts (deliberately left untouched in
 * this phase) don't provide. */
export function CostOverviewItemsList({ items, year }: CostOverviewItemsListProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Kostenpositionen</h2>
      {items.length === 0 ? (
        <div className="mt-4">
          <EmptyState message={`Keine Kostenpositionen für ${year} vorhanden.`} />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {sortItemsForDisplay(items).map((item) => (
            <li key={item.id}>
              <Link
                to={itemDetailPath(item)}
                className="block rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900">{item.description}</p>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {SOURCE_LABELS[item.source]} · {itemDateLabel(item, year)}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-semibold text-neutral-900">{formatCurrency(item.amount)}</p>
                </div>
                <p className="mt-2 text-right text-xs font-medium text-accent">Öffnen →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { formatCurrency } from '../../../utils/formatters'
import type { TopCostPosition } from '../statistics.types'

interface TopCostPositionsListProps {
  positions: TopCostPosition[]
}

export function TopCostPositionsList({ positions }: TopCostPositionsListProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Wichtigste Kostenpositionen</h2>
      {positions.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine Kostenpositionen für dieses Jahr vorhanden.</p>
      ) : (
        <ol className="mt-4 flex flex-col divide-y divide-neutral-100">
          {positions.map((position, index) => (
            <li key={`${position.description}-${index}`} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{position.description}</p>
                <p className="text-xs text-neutral-500">{position.categoryName}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-neutral-900">{formatCurrency(position.amount)}</p>
                <p className="text-xs text-neutral-400">
                  {position.percentage.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

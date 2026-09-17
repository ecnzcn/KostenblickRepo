import { WASTE_CATEGORY_LABELS } from '../../../constants/waste'
import type { WasteCostYearSummary } from '../../../domain/usecases/wasteCosts'
import { formatCurrency, formatPercentChange } from '../../../utils/formatters'

interface WasteCostYearCardProps {
  summary: WasteCostYearSummary
}

function formatSignedCurrency(amount: number): string {
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`
}

export function WasteCostYearCard({ summary }: WasteCostYearCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">Müllkosten gesamt</p>
      <p className="mt-1 text-3xl font-semibold text-neutral-900">{formatCurrency(summary.total)}</p>

      {summary.changePercent === undefined ? (
        <p className="mt-2 text-sm text-neutral-500">Kein Vergleich verfügbar</p>
      ) : (
        <div className="mt-2 text-sm">
          <p className="text-neutral-500">vs. {summary.year - 1}</p>
          {summary.changePercent === null ? (
            <p className="text-neutral-500">Keine Vergleichsbasis (Vorjahr: 0 €)</p>
          ) : (
            <p className={summary.changePercent > 0 ? 'font-medium text-red-600' : 'font-medium text-green-700'}>
              {summary.change !== undefined ? formatSignedCurrency(summary.change) : ''} ·{' '}
              {formatPercentChange(summary.changePercent)}
            </p>
          )}
        </div>
      )}

      {summary.byCategory.length > 0 ? (
        <ul className="mt-4 flex flex-col divide-y divide-neutral-100">
          {summary.byCategory.map((entry) => (
            <li key={entry.category} className="flex items-center justify-between py-2 text-sm">
              <span className="text-neutral-700">{WASTE_CATEGORY_LABELS[entry.category]}</span>
              <span className="font-medium text-neutral-900">{formatCurrency(entry.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

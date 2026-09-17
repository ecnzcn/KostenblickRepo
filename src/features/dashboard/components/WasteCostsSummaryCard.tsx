import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { formatCurrency, formatPercentChange } from '../../../utils/formatters'
import type { WasteCostYearSummary } from '../dashboard.types'

interface WasteCostsSummaryCardProps {
  summary: WasteCostYearSummary
}

export function WasteCostsSummaryCard({ summary }: WasteCostsSummaryCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Müllkosten</h2>
      {summary.total === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine Müllkosten für {summary.year} erfasst.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-xs text-neutral-500">{summary.year}</p>
          <p className="text-lg font-semibold text-neutral-900">{formatCurrency(summary.total)}</p>
          {summary.changePercent !== undefined && summary.changePercent !== null ? (
            <p className={summary.changePercent > 0 ? 'text-sm text-red-600' : 'text-sm text-green-700'}>
              {formatPercentChange(summary.changePercent)} gegenüber {summary.year - 1}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-neutral-400">Bereits in den Jahreskosten oben enthalten.</p>
        </div>
      )}
      <Link to={ROUTES.waste} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
        Müllkosten anzeigen
      </Link>
    </section>
  )
}

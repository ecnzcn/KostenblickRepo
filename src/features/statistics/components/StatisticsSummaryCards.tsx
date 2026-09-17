import { formatCurrency, formatPercentChangeOrDash } from '../../../utils/formatters'
import type { StatisticsSummary } from '../statistics.types'

interface StatisticsSummaryCardsProps {
  summary: StatisticsSummary
}

export function StatisticsSummaryCards({ summary }: StatisticsSummaryCardsProps) {
  const hasPreviousYear = summary.previousYearAmount !== undefined
  const isIncrease = (summary.yearOverYearChange ?? 0) > 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Gesamtkosten {summary.year}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">
          {formatCurrency(summary.totalAmount)}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          {summary.billCount} {summary.billCount === 1 ? 'Abrechnung' : 'Abrechnungen'}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Vorjahr</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">
          {hasPreviousYear ? formatCurrency(summary.previousYearAmount ?? 0) : '—'}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          {hasPreviousYear ? summary.year - 1 : 'Keine Daten für das Vorjahr'}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-500">Veränderung</p>
        {hasPreviousYear ? (
          <>
            <p
              className={`mt-1 text-3xl font-semibold tracking-tight ${isIncrease ? 'text-orange-600' : 'text-emerald-600'}`}
            >
              {formatPercentChangeOrDash(summary.yearOverYearChangePercent)}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {summary.yearOverYearChangePercent === null
                ? 'Vorjahr war 0 € – keine Vergleichsbasis'
                : `gegenüber ${summary.year - 1}`}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-300">—</p>
            <p className="mt-1 text-xs text-neutral-400">Noch kein Vorjahresvergleich</p>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { getStatisticsData } from '../../../domain/usecases/statistics/calculateStatistics'
import type { StatisticsSummary } from '../../statistics/statistics.types'
import { formatCurrency, formatPercentChangeOrDash } from '../../../utils/formatters'

/**
 * Compact statistics teaser for the Dashboard - loads its summary via the
 * same `getStatisticsData` Statistics use case the /statistik page uses,
 * so the year-over-year figure shown here can never drift from the one on
 * the Statistics page (CLAUDE.md: "Keine doppelte Berechnungslogik im
 * Dashboard").
 */
export function StatisticsSummaryCard() {
  const [summary, setSummary] = useState<StatisticsSummary>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getStatisticsData(new Date().getFullYear())
      .then((data) => {
        if (!cancelled) setSummary(data.summary)
      })
      .catch(() => {
        if (!cancelled) setSummary(undefined)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  // Nothing meaningful to show yet: no bills this year and no prior-year
  // comparison either.
  if (!summary || (summary.totalAmount === 0 && summary.previousYearAmount === undefined)) return null

  const hasComparison = summary.previousYearAmount !== undefined
  const isIncrease = (summary.yearOverYearChange ?? 0) > 0

  return (
    <Link
      to={ROUTES.statistics}
      className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300"
    >
      <p className="text-sm text-neutral-500">Kosten {summary.year}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">
        {formatCurrency(summary.totalAmount)}
      </p>
      {hasComparison ? (
        <p className={`mt-2 text-sm font-medium ${isIncrease ? 'text-orange-600' : 'text-emerald-600'}`}>
          <span aria-hidden="true">{isIncrease ? '↑' : '↓'}</span>{' '}
          {formatPercentChangeOrDash(summary.yearOverYearChangePercent)} zum Vorjahr
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-400">Noch kein Vorjahresvergleich</p>
      )}
      <span className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent">
        Statistik öffnen →
      </span>
    </Link>
  )
}

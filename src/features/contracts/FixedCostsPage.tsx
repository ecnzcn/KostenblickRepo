import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES, contractDetailPath } from '../../constants/navigation'
import { fixedCostOverviewFor, getFixedCostData, type FixedCostData } from '../../domain/usecases/fixedCosts/contractLinks'
import { formatCurrency, formatMonthKey } from '../../utils/formatters'
import { describeFixedCostRow, isWarning } from './fixedCostLabels'

/** Phase 14F: Soll (contract values) vs. Ist (linked debits) for a month. */
export function FixedCostsPage() {
  const [data, setData] = useState<FixedCostData | null>(null)
  const [error, setError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [month, setMonth] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getFixedCostData()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const selectedMonth = month ?? data?.defaultMonth
  const overview = useMemo(() => (data && selectedMonth ? fixedCostOverviewFor(data, selectedMonth) : null), [data, selectedMonth])

  if (error) {
    return (
      <ErrorState
        message="Die Fixkosten konnten nicht geladen werden."
        onRetry={() => {
          setError(false)
          setReloadToken((token) => token + 1)
        }}
      />
    )
  }
  if (!data || !overview || !selectedMonth) return <LoadingState />

  return (
    <>
      <PageHeader title="Fixkosten" subtitle="Vertragswerte im Vergleich mit den tatsächlichen Abbuchungen" />
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Monat
          <select
            value={selectedMonth}
            onChange={(event) => setMonth(event.target.value)}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            {data.months.map((entry) => (
              <option key={entry} value={entry}>
                {formatMonthKey(entry)}
              </option>
            ))}
          </select>
        </label>

        {overview.rows.length === 0 ? (
          <>
            <EmptyState message={`Keine aktiven Verträge im ${formatMonthKey(selectedMonth)}.`} />
            <Link to={ROUTES.contractsNew} className="inline-flex min-h-11 items-center self-start text-sm font-medium text-accent">
              + Vertrag hinzufügen
            </Link>
          </>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3" aria-label="Summen">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs text-neutral-500">Soll (Verträge)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{formatCurrency(overview.expectedTotal)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-xs text-neutral-500">Ist (abgebucht)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{formatCurrency(overview.actualTotal)}</p>
              </div>
            </section>
            <div className="flex flex-col gap-1 text-xs text-neutral-500">
              <p>Soll sind die hinterlegten Monatswerte der Verträge – sie zählen nie zu den Ausgaben. Ist enthält nur Buchungen, die einem Vertrag zugeordnet sind.</p>
              {!data.hasBookings ? (
                <p>
                  Noch keine Kontoumsätze importiert.{' '}
                  <Link to={ROUTES.transactionsImport} className="font-medium text-accent">
                    Sparkassen-CSV importieren
                  </Link>
                </p>
              ) : !overview.monthCovered ? (
                <p>Dieser Monat ist noch nicht vollständig importiert – fehlende Abbuchungen werden erst danach gemeldet.</p>
              ) : null}
              {overview.unlinkedCount > 0 ? (
                <p>
                  {overview.unlinkedCount === 1 ? '1 Vertrag hat' : `${overview.unlinkedCount} Verträge haben`} noch keine verknüpfte Buchung – öffne den
                  Vertrag, um Abbuchungen zuzuordnen.
                </p>
              ) : null}
            </div>

            <ul className="flex flex-col divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
              {overview.rows.map((row) => (
                <li key={row.contract.id}>
                  <Link to={contractDetailPath(row.contract.id)} className="flex min-h-11 flex-col gap-1 p-4 text-sm">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="break-words font-medium text-neutral-900">{row.contract.provider}</span>
                      <span className="shrink-0 tabular-nums text-neutral-900">
                        {row.status === 'unlinked' ? '–' : formatCurrency(row.actual)}
                        <span className="text-neutral-400"> / {formatCurrency(row.expected)}</span>
                      </span>
                    </span>
                    <span className={isWarning(row.status) ? 'text-amber-800' : 'text-neutral-500'}>{describeFixedCostRow(row)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">Beträge je Vertrag: abgebucht / Soll.</p>
          </>
        )}
        <Link to={ROUTES.contracts} className="min-h-11 self-start py-3 text-sm font-medium text-accent">
          Zu den Verträgen
        </Link>
      </div>
    </>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { billDetailPath, billEditPath, ROUTES } from '../../constants/navigation'
import type { BillSort, BillYearFilter } from './billFilters'
import { BillListItem } from './components/BillListItem'
import { useBills } from './hooks/useBills'

const SORT_OPTIONS: { value: BillSort; label: string }[] = [
  { value: 'year_desc', label: 'Jahr (neueste zuerst)' },
  { value: 'year_asc', label: 'Jahr (älteste zuerst)' },
  { value: 'amount_desc', label: 'Betrag (höchster zuerst)' },
  { value: 'amount_asc', label: 'Betrag (niedrigster zuerst)' },
  { value: 'created_desc', label: 'Erstellungsdatum (neueste zuerst)' },
]

export function BillsPage() {
  const { bills, visibleBills, years, loading, error, refetch, remove, filters, setFilters } = useBills()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const hasAnyBills = bills.length > 0
  const hasVisibleBills = visibleBills.length > 0

  async function handleDelete(id: string) {
    if (!window.confirm('Diese Abrechnung wirklich löschen?')) return
    try {
      await remove(id)
      showToast('Abrechnung gelöscht')
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  return (
    <>
      <PageHeader title="Abrechnungen" subtitle="Nebenkostenabrechnungen verwalten" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Die Abrechnungen konnten nicht geladen werden." onRetry={refetch} />
      ) : !hasAnyBills ? (
        <>
          <EmptyState message="Noch keine Abrechnung vorhanden." />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to={ROUTES.billsNew}
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
            >
              Abrechnung erfassen
            </Link>
            <Link
              to={ROUTES.billsImport}
              className="inline-flex min-h-11 items-center rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700"
            >
              Abrechnung importieren
            </Link>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ search: event.target.value })}
            placeholder="Abrechnungen durchsuchen …"
            aria-label="Abrechnungen durchsuchen"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Jahr
              <select
                value={filters.yearFilter}
                onChange={(event) => {
                  const value = event.target.value
                  setFilters({ yearFilter: value === 'all' ? 'all' : (Number(value) as BillYearFilter) })
                }}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                <option value="all">Alle Jahre</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Sortierung
              <select
                value={filters.sort}
                onChange={(event) => setFilters({ sort: event.target.value as BillSort })}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!hasVisibleBills ? (
            <EmptyState message="Keine Abrechnungen gefunden. Passe deine Suche oder Filter an." />
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleBills.map((bill) => (
                <BillListItem
                  key={bill.id}
                  bill={bill}
                  onOpen={() => navigate(billDetailPath(bill.id))}
                  onEdit={() => navigate(billEditPath(bill.id))}
                  onDelete={() => handleDelete(bill.id)}
                />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-3">
            <Link
              to={ROUTES.billsNew}
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
            >
              + Abrechnung hinzufügen
            </Link>
            <Link
              to={ROUTES.billsImport}
              className="inline-flex min-h-11 items-center rounded-full border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700"
            >
              + Abrechnung importieren
            </Link>
          </div>
        </div>
      )}
    </>
  )
}

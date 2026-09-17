import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { ROUTES, wasteDetailPath, wasteEditPath } from '../../constants/navigation'
import { WasteCostListItem } from './components/WasteCostListItem'
import { WasteCostYearCard } from './components/WasteCostYearCard'
import { useWasteCosts } from './hooks/useWasteCosts'

export function WasteCostsPage() {
  const {
    wasteCosts,
    selectedYear,
    setSelectedYear,
    entriesForYear,
    summary,
    loading,
    error,
    refetch,
    remove,
  } = useWasteCosts()
  const navigate = useNavigate()
  const { showToast } = useToast()

  async function handleDelete(id: string) {
    if (!window.confirm('Müllkosten löschen? Dieser Eintrag wird dauerhaft gelöscht.')) return
    try {
      await remove(id)
      showToast('Müllkosten gelöscht')
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  return (
    <>
      <PageHeader title="Müllkosten" subtitle="Kosten für Müll und Entsorgung im Überblick" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Die Müllkosten konnten nicht geladen werden." onRetry={refetch} />
      ) : wasteCosts.length === 0 ? (
        <>
          <EmptyState message="Noch keine Müllkosten erfasst. Speichere deine Müllgebühren, um deine jährlichen Kosten vergleichen zu können." />
          <Link
            to={ROUTES.wasteNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Müllkosten erfassen
          </Link>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-2">
            <button
              type="button"
              onClick={() => setSelectedYear(selectedYear - 1)}
              aria-label="Vorheriges Jahr"
              className="flex min-h-11 min-w-11 items-center justify-center text-lg text-neutral-700"
            >
              ‹
            </button>
            <p className="text-base font-semibold text-neutral-900">{selectedYear}</p>
            <button
              type="button"
              onClick={() => setSelectedYear(selectedYear + 1)}
              aria-label="Nächstes Jahr"
              className="flex min-h-11 min-w-11 items-center justify-center text-lg text-neutral-700"
            >
              ›
            </button>
          </div>

          {entriesForYear.length === 0 ? (
            <EmptyState message={`Keine Müllkosten für ${selectedYear} erfasst.`} />
          ) : (
            <>
              <WasteCostYearCard summary={summary} />
              <ul className="flex flex-col gap-3">
                {entriesForYear.map((entry) => (
                  <WasteCostListItem
                    key={entry.id}
                    entry={entry}
                    onOpen={() => navigate(wasteDetailPath(entry.id))}
                    onEdit={() => navigate(wasteEditPath(entry.id))}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </ul>
            </>
          )}

          <Link
            to={ROUTES.wasteNew}
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Müllkosten erfassen
          </Link>
        </div>
      )}
    </>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { costDetailPath, costEditPath, ROUTES } from '../../constants/navigation'
import { useCategories } from '../../hooks/useCategories'
import { useToast } from '../../components/feedback/useToast'
import { formatCurrency } from '../../utils/formatters'
import { CostListItem } from './components/CostListItem'
import { useCosts } from './hooks/useCosts'

export function CostsPage() {
  const { entries, loading, error, refetch, remove } = useCosts()
  const { categories } = useCategories()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)

  async function handleDelete(id: string) {
    if (!window.confirm('Diesen Kosteneintrag wirklich löschen?')) return
    try {
      await remove(id)
      showToast('Kosten gelöscht')
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  return (
    <>
      <PageHeader title="Kosten" subtitle="Alle erfassten Ausgaben" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Die Kostendaten konnten nicht geladen werden." onRetry={refetch} />
      ) : entries.length === 0 ? (
        <>
          <EmptyState message="Noch keine Kosten vorhanden. Erfasse deine erste Ausgabe." />
          <Link
            to={ROUTES.costsNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Kosten erfassen
          </Link>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-sm font-medium text-neutral-500">Gesamt</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(total)}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <CostListItem
                key={entry.id}
                entry={entry}
                category={categoriesById.get(entry.categoryId)}
                onOpen={() => navigate(costDetailPath(entry.id))}
                onEdit={() => navigate(costEditPath(entry.id))}
                onDelete={() => handleDelete(entry.id)}
              />
            ))}
          </ul>
          <Link
            to={ROUTES.costsNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Kosten erfassen
          </Link>
        </>
      )}
    </>
  )
}

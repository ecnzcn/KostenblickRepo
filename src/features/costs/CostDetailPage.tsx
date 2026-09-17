import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { costEditPath, ROUTES } from '../../constants/navigation'
import type { Category, CostEntry } from '../../domain/models/entities'
import { deleteCostEntry, getCostEntry } from '../../domain/usecases/costs'
import { categoryRepository } from '../../domain/repositories/categories'
import { formatCurrency, formatDate } from '../../utils/formatters'

export function CostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [entry, setEntry] = useState<CostEntry | undefined>()
  const [category, setCategory] = useState<Category | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getCostEntry(id), categoryRepository.getAll()])
      .then(([foundEntry, categories]) => {
        if (cancelled) return
        if (!foundEntry || foundEntry.deletedAt) {
          setError(true)
          return
        }
        setEntry(foundEntry)
        setCategory(categories.find((c) => c.id === foundEntry.categoryId))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleDelete() {
    if (!id || !window.confirm('Diesen Kosteneintrag wirklich löschen?')) return
    try {
      await deleteCostEntry(id)
      showToast('Kosten gelöscht')
      navigate(ROUTES.costs)
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  if (loading) return <LoadingState />
  if (error || !entry) return <ErrorState message="Dieser Kosteneintrag wurde nicht gefunden." />

  const label = category ? `${category.icon} ${category.name}` : 'Sonstiges'

  return (
    <>
      <PageHeader title={label} subtitle={formatDate(entry.date)} />
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Betrag</p>
          <p className="mt-1 text-3xl font-semibold text-neutral-900">{formatCurrency(entry.amount)}</p>
          {entry.notes ? (
            <>
              <p className="mt-4 text-sm text-neutral-500">Notiz</p>
              <p className="mt-1 text-sm text-neutral-700">{entry.notes}</p>
            </>
          ) : null}
        </div>
        <ItemActions itemLabel={label} onEdit={() => navigate(costEditPath(entry.id))} onDelete={handleDelete} />
      </div>
    </>
  )
}

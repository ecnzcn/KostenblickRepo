import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { billDetailPath, billEditPath, ROUTES } from '../../constants/navigation'
import { BillListItem } from './components/BillListItem'
import { useBills } from './hooks/useBills'

export function BillsPage() {
  const { bills, loading, error, refetch, remove } = useBills()
  const navigate = useNavigate()
  const { showToast } = useToast()

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
      ) : bills.length === 0 ? (
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
        <>
          <ul className="flex flex-col gap-3">
            {bills.map((bill) => (
              <BillListItem
                key={bill.id}
                bill={bill}
                onOpen={() => navigate(billDetailPath(bill.id))}
                onEdit={() => navigate(billEditPath(bill.id))}
                onDelete={() => handleDelete(bill.id)}
              />
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
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
        </>
      )}
    </>
  )
}

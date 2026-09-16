import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { contractDetailPath, contractEditPath, ROUTES } from '../../constants/navigation'
import { ContractListItem } from './components/ContractListItem'
import { useContracts } from './hooks/useContracts'

export function ContractsPage() {
  const { contracts, loading, error, refetch, remove } = useContracts()
  const navigate = useNavigate()
  const { showToast } = useToast()

  async function handleDelete(id: string) {
    if (!window.confirm('Diesen Vertrag wirklich löschen?')) return
    try {
      await remove(id)
      showToast('Vertrag gelöscht')
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  return (
    <>
      <PageHeader title="Verträge" subtitle="Strom-, Internet- und weitere Verträge" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Die Verträge konnten nicht geladen werden." onRetry={refetch} />
      ) : contracts.length === 0 ? (
        <>
          <EmptyState message="Noch keine Verträge vorhanden." />
          <Link
            to={ROUTES.contractsNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Vertrag hinzufügen
          </Link>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {contracts.map((contract) => (
              <ContractListItem
                key={contract.id}
                contract={contract}
                onOpen={() => navigate(contractDetailPath(contract.id))}
                onEdit={() => navigate(contractEditPath(contract.id))}
                onDelete={() => handleDelete(contract.id)}
              />
            ))}
          </ul>
          <Link
            to={ROUTES.contractsNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Vertrag hinzufügen
          </Link>
        </>
      )}
    </>
  )
}

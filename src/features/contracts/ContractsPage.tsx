import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { contractDetailPath, contractEditPath, ROUTES } from '../../constants/navigation'
import { useCategories } from '../../hooks/useCategories'
import {
  DEFAULT_CONTRACT_FILTERS,
  filterAndSortContracts,
  getContractCategoryIds,
  type ContractReminderFilter,
  type ContractSort,
  type ContractStatusFilter,
} from './contractFilters'
import { ContractListItem } from './components/ContractListItem'
import { useContracts } from './hooks/useContracts'

const STATUS_OPTIONS: { value: ContractStatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Nicht aktiv' },
]

const REMINDER_OPTIONS: { value: ContractReminderFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'enabled', label: 'Aktiviert' },
  { value: 'disabled', label: 'Deaktiviert' },
]

const SORT_OPTIONS: { value: ContractSort; label: string }[] = [
  { value: 'upcoming_deadline', label: 'Kündigungsfrist (bald fällig zuerst)' },
  { value: 'provider_asc', label: 'Anbieter A–Z' },
  { value: 'provider_desc', label: 'Anbieter Z–A' },
  { value: 'monthly_cost_desc', label: 'Monatliche Kosten (höchste zuerst)' },
  { value: 'monthly_cost_asc', label: 'Monatliche Kosten (niedrigste zuerst)' },
  { value: 'start_date_desc', label: 'Vertragsbeginn (neueste zuerst)' },
  { value: 'start_date_asc', label: 'Vertragsbeginn (älteste zuerst)' },
]

export function ContractsPage() {
  const { contracts, loading, error, refetch, remove, filters, setFilters } = useContracts()
  const { categories } = useCategories()
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const navigate = useNavigate()
  const { showToast } = useToast()

  const hasAnyContracts = contracts.length > 0
  const visibleContracts = filterAndSortContracts(contracts, categoriesById, filters)
  const hasVisibleContracts = visibleContracts.length > 0
  const categoryIds = getContractCategoryIds(contracts)
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_CONTRACT_FILTERS)

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
      ) : !hasAnyContracts ? (
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
        <div className="flex flex-col gap-4">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ search: event.target.value })}
            placeholder="Verträge durchsuchen …"
            aria-label="Verträge durchsuchen"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Status
              <select
                value={filters.statusFilter}
                onChange={(event) => setFilters({ statusFilter: event.target.value as ContractStatusFilter })}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {categoryIds.length > 0 ? (
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                Kategorie
                <select
                  value={filters.categoryFilter}
                  onChange={(event) => setFilters({ categoryFilter: event.target.value })}
                  className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
                >
                  <option value="all">Alle</option>
                  {categoryIds.map((categoryId) => (
                    <option key={categoryId} value={categoryId}>
                      {categoriesById.get(categoryId)?.name ?? categoryId}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Erinnerung
              <select
                value={filters.reminderFilter}
                onChange={(event) => setFilters({ reminderFilter: event.target.value as ContractReminderFilter })}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Sortierung
              <select
                value={filters.sort}
                onChange={(event) => setFilters({ sort: event.target.value as ContractSort })}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setFilters(DEFAULT_CONTRACT_FILTERS)}
              disabled={!isFiltered}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              Filter zurücksetzen
            </button>
          </div>

          {!hasVisibleContracts ? (
            <EmptyState message="Keine Verträge gefunden. Passe deine Suche oder Filter an." />
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleContracts.map((contract) => (
                <ContractListItem
                  key={contract.id}
                  contract={contract}
                  category={categoriesById.get(contract.categoryId)}
                  onOpen={() => navigate(contractDetailPath(contract.id))}
                  onEdit={() => navigate(contractEditPath(contract.id))}
                  onDelete={() => handleDelete(contract.id)}
                />
              ))}
            </ul>
          )}
          <Link
            to={ROUTES.contractsNew}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            + Vertrag hinzufügen
          </Link>
        </div>
      )}
    </>
  )
}

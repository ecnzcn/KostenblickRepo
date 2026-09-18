import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { documentDetailPath } from '../../constants/navigation'
import { DocumentListItem } from './components/DocumentListItem'
import type { DocumentOcrFilter, DocumentSort, DocumentTypeFilter } from './documentFilters'
import { useDocuments } from './hooks/useDocuments'

const TYPE_CHIPS: { value: DocumentTypeFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'bill', label: 'Rechnungen' },
  { value: 'contract', label: 'Verträge' },
  { value: 'waste', label: 'Müll' },
  { value: 'other', label: 'Sonstige' },
]

const OCR_CHIPS: { value: DocumentOcrFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'verified', label: 'OCR verifiziert' },
  { value: 'needs_review', label: 'OCR benötigt Prüfung' },
  { value: 'failed', label: 'OCR fehlgeschlagen' },
]

const SORT_OPTIONS: { value: DocumentSort; label: string }[] = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'name_asc', label: 'Dateiname A–Z' },
  { value: 'name_desc', label: 'Dateiname Z–A' },
  { value: 'size', label: 'Größe' },
]

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium ${
        active ? 'border-accent bg-accent text-white' : 'border-neutral-300 bg-white text-neutral-700'
      }`}
    >
      {label}
    </button>
  )
}

export function DocumentsPage() {
  const { entries, visibleEntries, loading, error, refetch, filters, setFilters } = useDocuments()
  const navigate = useNavigate()

  const hasAnyDocuments = entries.length > 0
  const hasVisibleDocuments = visibleEntries.length > 0

  return (
    <>
      <PageHeader title="Dokumente" subtitle="Rechnungen, Verträge und sonstige Unterlagen an einem Ort" />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message="Die Dokumente konnten nicht geladen werden." onRetry={refetch} />
      ) : !hasAnyDocuments ? (
        <EmptyState message="Noch keine Dokumente. Hier werden deine Rechnungen, Verträge und sonstigen Unterlagen gesammelt." />
      ) : (
        <div className="flex flex-col gap-4">
          <input
            type="search"
            value={filters.search}
            onChange={(event) => setFilters({ search: event.target.value })}
            placeholder="Dokumente durchsuchen …"
            aria-label="Dokumente durchsuchen"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />

          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {TYPE_CHIPS.map((chip) => (
              <Chip
                key={chip.value}
                label={chip.label}
                active={filters.typeFilter === chip.value}
                onClick={() => setFilters({ typeFilter: chip.value })}
              />
            ))}
          </div>

          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {OCR_CHIPS.map((chip) => (
              <Chip
                key={chip.value}
                label={chip.label}
                active={filters.ocrFilter === chip.value}
                onClick={() => setFilters({ ocrFilter: chip.value })}
              />
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Sortierung
            <select
              value={filters.sort}
              onChange={(event) => setFilters({ sort: event.target.value as DocumentSort })}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {!hasVisibleDocuments ? (
            <EmptyState message="Keine Dokumente gefunden. Passe deine Suche oder Filter an." />
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleEntries.map((entry) => (
                <DocumentListItem
                  key={entry.document.id}
                  entry={entry}
                  onOpen={() => navigate(documentDetailPath(entry.document.id))}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

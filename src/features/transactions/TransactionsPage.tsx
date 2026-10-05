import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES, transactionDetailPath } from '../../constants/navigation'
import { undoImport, type ImportHistoryEntry } from '../../domain/usecases/bankImport/importTransactions'
import type { Category, Transaction } from '../../domain/models/entities'
import { formatCurrency, formatDate, formatMonthKey } from '../../utils/formatters'
import {
  UNCATEGORIZED_FILTER,
  filterCategoryOptions,
  filterTransactions,
  filtersFromParams,
  filtersToParams,
  isFiltered,
  type FlowFilter,
  type TransactionFilters,
} from './transactionFilters'
import { flowLabel } from './transactionLabels'
import { useImportOverview, useTransactionData } from './useImportOverview'

const PRIMARY = 'inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-medium text-white'

function ImportEntry({ entry, onUndone }: { entry: ImportHistoryEntry; onUndone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { batch } = entry

  async function handleUndo() {
    setBusy(true)
    setError(null)
    try {
      await undoImport(batch.id)
      onUndone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Der Import konnte nicht rückgängig gemacht werden.')
      setBusy(false)
    }
  }

  return (
    <li className="p-4">
      <p className="text-sm font-medium text-neutral-900">{entry.accountName}</p>
      <p className="break-words text-xs text-neutral-500">{batch.filename}</p>
      <p className="mt-1 text-sm text-neutral-700">
        {batch.periodFrom && batch.periodTo ? `${formatDate(batch.periodFrom)} – ${formatDate(batch.periodTo)}` : 'Ohne gebuchte Umsätze'}
      </p>
      <p className="text-xs text-neutral-500">
        {batch.counts.new} neu · {batch.counts.duplicates} bereits vorhanden · {batch.counts.skippedPending} vorgemerkt · importiert am{' '}
        {formatDate(batch.importedAt)}
      </p>
      {confirming ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-neutral-800">
            Die {batch.counts.new} Buchungen dieses Imports werden gelöscht. Das lässt sich nicht automatisch rückgängig machen.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={busy}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              Import löschen
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-2 min-h-11 text-sm font-medium text-accent">
          Import rückgängig machen
        </button>
      )}
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

const PAGE_SIZE = 50
const SELECT = 'min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900'

const FLOW_OPTIONS: { value: FlowFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'income', label: 'Einnahmen' },
  { value: 'expense', label: 'Ausgaben' },
  { value: 'saving', label: 'Sparen' },
  { value: 'transfer', label: 'Umbuchungen' },
]

function amountClass(transaction: Transaction): string {
  if (transaction.flowType === 'transfer' || transaction.flowType === 'saving') return 'text-neutral-600'
  return transaction.amount < 0 ? 'text-neutral-900' : 'text-emerald-700'
}

function TransactionList({ transactions, categoriesById }: { transactions: Transaction[]; categoriesById: ReadonlyMap<string, Category> }) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  return (
    <>
      <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white" aria-label="Buchungsliste">
        {transactions.slice(0, visible).map((transaction) => {
          const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : undefined
          return (
            <li key={transaction.id}>
              <Link to={transactionDetailPath(transaction.id)} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-neutral-900">
                    {transaction.counterpartyName || transaction.bookingText || 'Buchung'}
                  </span>
                  <span className="block truncate text-xs text-neutral-500">
                    {formatDate(transaction.bookingDate)} · {category ? `${category.icon} ${category.name}` : flowLabel(transaction)}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-medium tabular-nums ${amountClass(transaction)}`}>{formatCurrency(transaction.amount)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      {transactions.length > visible ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="min-h-11 self-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
        >
          Weitere {Math.min(PAGE_SIZE, transactions.length - visible)} anzeigen
        </button>
      ) : null}
    </>
  )
}

export function TransactionsPage() {
  const { overview, error, reload } = useImportOverview()
  const finance = useTransactionData(overview)
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(params), [params])

  const categoriesById = useMemo(() => new Map((finance.data?.categories ?? []).map((category) => [category.id, category])), [finance.data])
  const filtered = useMemo(
    () => (finance.data ? filterTransactions(finance.data.transactions, categoriesById, filters) : []),
    [finance.data, categoriesById, filters],
  )

  if (error || finance.error) return <ErrorState message="Die Buchungen konnten nicht geladen werden." onRetry={reload} />
  if (!overview || !finance.data) return <LoadingState />

  const data = finance.data
  const setFilters = (next: Partial<TransactionFilters>) => setParams(filtersToParams({ ...filters, ...next }), { replace: true })
  const categoryOptions = filterCategoryOptions(data.transactions, data.categories)

  return (
    <>
      <PageHeader title="Buchungen" subtitle="Kontoumsätze aus deinen Sparkassen-Exporten" />
      <div className="flex flex-col gap-4">
        <Link to={ROUTES.transactionsImport} className={`${PRIMARY} self-start`}>
          Sparkassen-CSV importieren
        </Link>

        {overview.provisionalSettlements > 0 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-neutral-800" role="status">
            {overview.provisionalSettlements === 1
              ? 'Für 1 Kreditkartenabrechnung fehlen noch die Kartenumsätze.'
              : `Für ${overview.provisionalSettlements} Kreditkartenabrechnungen fehlen noch die Kartenumsätze.`}{' '}
            Bitte die aktuelle Kreditkarten-CSV importieren. Bis dahin zählt die Abrechnung nicht als Ausgabe, damit
            bereits importierte Kartenumsätze nicht doppelt zählen.
          </p>
        ) : null}

        {data.transactions.length === 0 ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
            <h2 className="font-semibold text-neutral-900">Noch keine Buchungen</h2>
            <p className="mt-2">
              Exportiere im Online-Banking deine Umsätze unter „Umsätze → Export“ als „Excel (CSV-CAMT V2)“ und
              importiere die Datei hier. Die Kreditkarten-CSV der Sparkasse kannst du ebenfalls importieren.
            </p>
            <p className="mt-2 text-neutral-500">
              Die Datei wird nur auf diesem Gerät gelesen. Buchungen werden nicht synchronisiert.
            </p>
          </section>
        ) : (
          <>
            {overview.uncategorized.length > 0 && filters.category !== UNCATEGORIZED_FILTER ? (
              <button
                type="button"
                onClick={() => setFilters({ category: UNCATEGORIZED_FILTER })}
                className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-neutral-800"
              >
                <span>
                  {overview.uncategorized.length === 1 ? '1 Buchung ist' : `${overview.uncategorized.length} Buchungen sind`} noch ohne Kategorie.
                </span>
                <span className="shrink-0 font-medium text-accent">Anzeigen</span>
              </button>
            ) : null}

            <section aria-label="Filter" className="flex flex-col gap-3">
              <input
                type="search"
                value={filters.search}
                onChange={(event) => setFilters({ search: event.target.value })}
                placeholder="Name, Verwendungszweck, Betrag …"
                aria-label="Buchungen durchsuchen"
                className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  Monat
                  <select value={filters.month} onChange={(event) => setFilters({ month: event.target.value })} className={SELECT}>
                    <option value="all">Alle</option>
                    {data.months.map((month) => (
                      <option key={month} value={month}>
                        {formatMonthKey(month)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  Kategorie
                  <select value={filters.category} onChange={(event) => setFilters({ category: event.target.value })} className={SELECT}>
                    <option value="all">Alle</option>
                    <option value={UNCATEGORIZED_FILTER}>Ohne Kategorie</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  Art
                  <select value={filters.flow} onChange={(event) => setFilters({ flow: event.target.value as FlowFilter })} className={SELECT}>
                    {FLOW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                  disabled={!isFiltered(filters)}
                  className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  Filter zurücksetzen
                </button>
              </div>
            </section>

            <p className="text-sm text-neutral-600" aria-live="polite">
              {filtered.length === 1 ? '1 Buchung' : `${filtered.length.toLocaleString('de-DE')} Buchungen`}
            </p>
            {filtered.length === 0 ? (
              <EmptyState message="Keine Buchungen gefunden. Passe deine Suche oder Filter an." />
            ) : (
              <TransactionList key={params.toString()} transactions={filtered} categoriesById={categoriesById} />
            )}
          </>
        )}

        {overview.imports.length > 0 ? (
          <details className="rounded-2xl border border-neutral-200 bg-white">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-900">
              Importe <span className="font-normal text-neutral-500">· {overview.imports.length}</span>
            </summary>
            <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
              {overview.imports.map((entry) => (
                <ImportEntry key={entry.batch.id} entry={entry} onUndone={reload} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  )
}

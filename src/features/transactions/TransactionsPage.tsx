import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import { undoImport, type ImportHistoryEntry } from '../../domain/usecases/bankImport/importTransactions'
import { formatDate } from '../../utils/formatters'
import { useImportOverview } from './useImportOverview'

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

export function TransactionsPage() {
  const { overview, error, reload } = useImportOverview()

  if (error) return <ErrorState message="Die Buchungen konnten nicht geladen werden." onRetry={reload} />
  if (!overview) return <LoadingState />

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

        {overview.imports.length === 0 ? (
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
          <section className="rounded-2xl border border-neutral-200 bg-white">
            <h2 className="px-4 pt-4 text-sm font-semibold text-neutral-900">
              Importe <span className="font-normal text-neutral-500">· {overview.transactionCount} Buchungen</span>
            </h2>
            <ul className="divide-y divide-neutral-200">
              {overview.imports.map((entry) => (
                <ImportEntry key={entry.batch.id} entry={entry} onUndone={reload} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

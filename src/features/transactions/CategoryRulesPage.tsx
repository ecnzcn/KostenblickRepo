import { useEffect, useState } from 'react'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { deleteRule, listRules, type RuleOverviewEntry } from '../../domain/usecases/categorization/transactionCategorization'

function RuleItem({ entry, onDeleted }: { entry: RuleOverviewEntry; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    try {
      await deleteRule(entry.rule.id)
      onDeleted()
    } catch {
      setError('Die Regel konnte nicht gelöscht werden.')
    }
  }

  return (
    <li className="p-4 text-sm">
      <p className="break-words text-neutral-900">{entry.description}</p>
      <p className="text-neutral-500">→ {entry.target}</p>
      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-neutral-700">Regel löschen? Bereits zugeordnete Buchungen bleiben, wie sie sind.</span>
          <button type="button" onClick={() => void handleDelete()} className="min-h-11 rounded-xl bg-red-600 px-4 font-medium text-white">
            Löschen
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 font-medium text-neutral-700"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="mt-1 min-h-11 font-medium text-accent">
          Regel löschen
        </button>
      )}
      {error ? (
        <p className="text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

export function CategoryRulesPage() {
  const [rules, setRules] = useState<RuleOverviewEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listRules()
      .then((result) => {
        if (!cancelled) setRules(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  if (error) return <ErrorState message="Die Regeln konnten nicht geladen werden." onRetry={() => setReloadToken((token) => token + 1)} />
  if (!rules) return <LoadingState />

  return (
    <>
      <PageHeader title="Kategorieregeln" subtitle="Wie Buchungen automatisch zugeordnet werden" />
      <div className="flex flex-col gap-4">
        {rules.length === 0 ? (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
            <h2 className="font-semibold text-neutral-900">Noch keine eigenen Regeln</h2>
            <p className="mt-2">
              Eine Regel entsteht, wenn du bei einer Buchung die Zuordnung änderst und „Immer so zuordnen“ wählst.
            </p>
          </section>
        ) : (
          <section className="rounded-2xl border border-neutral-200 bg-white">
            <h2 className="px-4 pt-4 text-sm font-semibold text-neutral-900">Eigene Regeln</h2>
            <p className="px-4 text-xs text-neutral-500">Die oberste passende Regel gewinnt. Von dir zugeordnete Buchungen ändert keine Regel.</p>
            <ul className="divide-y divide-neutral-200">
              {rules.map((entry) => (
                <RuleItem key={entry.rule.id} entry={entry} onDeleted={() => setReloadToken((token) => token + 1)} />
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
          <h2 className="font-semibold text-neutral-900">Standardregeln</h2>
          <p className="mt-2">
            Ohne eigene Regel ordnet Kostenblick bekannte Supermärkte, Drogerien, Tankstellen und Telefonanbieter am
            Namen zu, Kreditkartenumsätze an der Händlerkategorie aus dem Export und alles andere nach der Kategorie der
            Sparkasse. Das sind Vorschläge – du kannst jede Buchung ändern.
          </p>
        </section>
      </div>
    </>
  )
}

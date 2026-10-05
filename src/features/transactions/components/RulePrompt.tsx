import { useEffect, useState } from 'react'
import type { Transaction } from '../../../domain/models/entities'
import {
  RULE_FIELD_LABELS,
  countRuleMatches,
  createRule,
  suggestRuleDrafts,
  type AssignmentChoice,
  type RuleDraft,
} from '../../../domain/usecases/categorization/transactionCategorization'

const PRIMARY = 'min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-60'
const SECONDARY = 'min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 disabled:opacity-60'

interface RulePromptProps {
  transaction: Transaction
  choice: Exclude<AssignmentChoice, { kind: 'none' }>
  onDone: () => void
}

/** "Immer so zuordnen?" after a manual assignment (spec 14E). */
export function RulePrompt({ transaction, choice, onDone }: RulePromptProps) {
  const drafts = suggestRuleDrafts(transaction)
  const [selected, setSelected] = useState(0)
  const [patterns, setPatterns] = useState(() => drafts.map((draft) => draft.pattern))
  const [applyToExisting, setApplyToExisting] = useState(true)
  const [matches, setMatches] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | { saved: number } | { error: string }>('idle')

  const base = drafts[selected]
  const draft: RuleDraft | undefined = base ? { ...base, pattern: patterns[selected] ?? base.pattern } : undefined

  const field = draft?.field
  const pattern = draft?.pattern
  const matchType = draft?.matchType

  useEffect(() => {
    if (!field || pattern === undefined || !matchType) return
    let cancelled = false
    countRuleMatches({ field, pattern, matchType }, transaction.id)
      .then((count) => {
        if (!cancelled) setMatches(count)
      })
      .catch(() => {
        if (!cancelled) setMatches(null)
      })
    return () => {
      cancelled = true
    }
  }, [field, pattern, matchType, transaction.id])

  if (!draft) return null

  if (typeof state === 'object' && 'saved' in state) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-neutral-800" role="status">
        Regel gespeichert
        {state.saved > 0 ? ` – ${state.saved === 1 ? '1 weitere Buchung' : `${state.saved} weitere Buchungen`} angepasst.` : '.'}
        <button type="button" onClick={onDone} className="ml-2 min-h-11 font-medium text-accent">
          Schließen
        </button>
      </div>
    )
  }

  async function handleCreate() {
    if (!draft) return
    setState('saving')
    try {
      const saved = await createRule({ ...draft, choice, applyToExisting })
      setState({ saved })
    } catch (caught) {
      setState({ error: caught instanceof Error ? caught.message : 'Die Regel konnte nicht gespeichert werden.' })
    }
  }

  return (
    <fieldset className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
      <legend className="px-1 font-semibold text-neutral-900">Immer so zuordnen?</legend>
      <p className="text-neutral-600">Künftige Buchungen werden dann automatisch genauso zugeordnet, wenn …</p>
      <div className="mt-2 flex flex-col gap-2">
        {drafts.map((option, index) => (
          <label key={option.field} className="flex min-h-11 items-start gap-2">
            <input
              type="radio"
              name="rule-field"
              className="mt-1"
              checked={selected === index}
              onChange={() => setSelected(index)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-neutral-800">
                {RULE_FIELD_LABELS[option.field]} {option.matchType === 'equals' ? 'ist' : 'enthält'}
              </span>
              {option.matchType === 'contains' && selected === index ? (
                <input
                  type="text"
                  aria-label={`${RULE_FIELD_LABELS[option.field]} enthält`}
                  value={patterns[index] ?? ''}
                  onChange={(event) => setPatterns((current) => current.map((value, position) => (position === index ? event.target.value : value)))}
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3"
                />
              ) : (
                <span className="block break-all text-neutral-500">„{option.pattern}“</span>
              )}
            </span>
          </label>
        ))}
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-neutral-800">
        <input type="checkbox" checked={applyToExisting} onChange={(event) => setApplyToExisting(event.target.checked)} />
        {matches === null
          ? 'Auch auf passende bestehende Buchungen anwenden'
          : `Auch auf ${matches === 1 ? '1 passende bestehende Buchung' : `${matches} passende bestehende Buchungen`} anwenden`}
      </label>
      <p className="text-xs text-neutral-500">Von dir zugeordnete Buchungen werden nie geändert.</p>
      {typeof state === 'object' && 'error' in state ? (
        <p className="mt-2 text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void handleCreate()} disabled={state === 'saving'} className={PRIMARY}>
          Regel anlegen
        </button>
        <button type="button" onClick={onDone} disabled={state === 'saving'} className={SECONDARY}>
          Nur diese Buchung
        </button>
      </div>
    </fieldset>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { getSavingsGoal, removeSavingsGoal, saveSavingsGoal } from '../../../domain/usecases/finance/savingsGoal'
import { formatCurrency } from '../../../utils/formatters'
import { parseGermanAmount } from '../../../utils/money'

/** Phase 14H: the monthly savings goal (local only, part of the backup). */
export function SavingsGoalSettings() {
  const [target, setTarget] = useState<number | undefined>()
  const [input, setInput] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    getSavingsGoal()
      .then((goal) => {
        if (cancelled) return
        setTarget(goal?.monthlyTarget)
        setInput(goal ? String(goal.monthlyTarget).replace('.', ',') : '')
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setMessage({ text: 'Das Sparziel konnte nicht geladen werden.', error: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const goal = await saveSavingsGoal(parseGermanAmount(input))
      setTarget(goal.monthlyTarget)
      setMessage({ text: `Sparziel gespeichert: ${formatCurrency(goal.monthlyTarget)} pro Monat.`, error: false })
    } catch (caught) {
      setMessage({ text: caught instanceof Error ? caught.message : 'Das Sparziel konnte nicht gespeichert werden.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    setMessage(null)
    try {
      await removeSavingsGoal()
      setTarget(undefined)
      setInput('')
      setMessage({ text: 'Sparziel entfernt.', error: false })
    } catch {
      setMessage({ text: 'Das Sparziel konnte nicht entfernt werden.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="sparziel" className="rounded-2xl border border-neutral-200 bg-white p-5" aria-labelledby="savings-goal-title">
      <h2 id="savings-goal-title" className="text-sm font-semibold text-neutral-900">
        Sparziel
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        Wie viel pro Monat übrig bleiben soll – gezählt wird, was nach den Ausgaben übrig ist, einschließlich der Überweisungen auf
        deine Spar- und Anlagekonten. Bleibt nur auf diesem Gerät und ist im Backup enthalten.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-neutral-700">
          Monatsziel in €
          <input
            type="text"
            inputMode="decimal"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="z. B. 500"
            disabled={!loaded || busy}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base text-neutral-900"
          />
        </label>
        <button type="submit" disabled={!loaded || busy} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-medium text-white disabled:opacity-60">
          Sparziel speichern
        </button>
        {target !== undefined ? (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={busy}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 disabled:opacity-60"
          >
            Sparziel entfernen
          </button>
        ) : null}
      </form>
      {message ? (
        <p className={`mt-2 text-sm ${message.error ? 'text-red-600' : 'text-emerald-700'}`} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
    </section>
  )
}

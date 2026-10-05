import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES, transactionDetailPath } from '../../../constants/navigation'
import type { Contract } from '../../../domain/models/entities'
import type { ContractCadence, ContractMonth } from '../../../domain/usecases/fixedCosts/contractComparison'
import {
  getContractBookings,
  linkContract,
  unlinkContract,
  type ContractBookingsData,
  type ContractLinkSuggestion,
  type SuggestionBasis,
} from '../../../domain/usecases/fixedCosts/contractLinks'
import { formatCurrency, formatDate, formatMonthKey } from '../../../utils/formatters'
import { describeMonth } from '../fixedCostLabels'

const CADENCE_LABELS: Record<ContractCadence, string> = {
  monthly: 'Monatliche Abbuchung',
  yearly: 'Jährliche Abbuchung',
  irregular: 'Unregelmäßige Abbuchungen – kein Abgleich mit dem Vertragswert möglich.',
}

const BASIS_LABELS: Record<SuggestionBasis, string> = {
  name: 'Name passt zum Anbieter',
  amount: 'Betrag passt in mehreren Monaten',
  name_and_amount: 'Name und Betrag passen',
}

const MAX_BOOKINGS = 6

function MonthRow({ entry }: { entry: ContractMonth }) {
  const tone = entry.status === 'missing' || entry.status === 'deviation' ? 'text-amber-800' : 'text-neutral-600'
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
      <span className="text-neutral-900">{formatMonthKey(entry.month)}</span>
      <span className={tone}>{describeMonth(entry)}</span>
    </li>
  )
}

function Suggestion({ suggestion, busy, onLink }: { suggestion: ContractLinkSuggestion; busy: boolean; onLink: () => void }) {
  return (
    <li className="flex flex-col gap-1 py-3 text-sm">
      <p className="break-words font-medium text-neutral-900">{suggestion.counterpartyName || 'Ohne Namen'}</p>
      <p className="break-words text-neutral-600">{suggestion.description}</p>
      <p className="text-neutral-500">
        {suggestion.bookingCount === 1 ? '1 Buchung' : `${suggestion.bookingCount} Buchungen`}, zuletzt am {formatDate(suggestion.lastBookingDate)}:{' '}
        {formatCurrency(suggestion.lastAmount)} · {BASIS_LABELS[suggestion.basis]}
      </p>
      <button
        type="button"
        onClick={onLink}
        disabled={busy}
        aria-label={`${suggestion.counterpartyName || 'Vorschlag'} zuordnen`}
        className="mt-1 min-h-11 self-start rounded-xl bg-accent px-4 font-medium text-white disabled:opacity-60"
      >
        Zuordnen
      </button>
    </li>
  )
}

/** Phase 14F: debits of a contract compared with its contract value. */
export function ContractBookingsSection({ contract }: { contract: Contract }) {
  const [data, setData] = useState<ContractBookingsData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmingUnlink, setConfirmingUnlink] = useState(false)

  useEffect(() => {
    let cancelled = false
    getContractBookings(contract)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [contract, reloadToken])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setConfirmingUnlink(false)
      setReloadToken((token) => token + 1)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Das hat nicht geklappt. Bitte versuche es erneut.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5" aria-labelledby="contract-bookings-title">
      <h2 id="contract-bookings-title" className="text-sm font-semibold text-neutral-900">
        Abbuchungen
      </h2>
      {loadError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          Die Abbuchungen konnten nicht geladen werden.
        </p>
      ) : !data ? (
        <p className="mt-2 text-sm text-neutral-500">Wird geladen …</p>
      ) : !data.hasBookings ? (
        <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-600">
          <p>Importiere deine Kontoumsätze, um die Abbuchungen dieses Vertrags mit dem Vertragswert zu vergleichen.</p>
          <Link to={ROUTES.transactionsImport} className="inline-flex min-h-11 items-center self-start font-medium text-accent">
            Sparkassen-CSV importieren
          </Link>
        </div>
      ) : data.comparison.bookings.length > 0 ? (
        <div className="mt-2 flex flex-col gap-3">
          {data.rules.length > 0 ? (
            <p className="break-words text-sm text-neutral-600">Verknüpft über: {data.rules.map((entry) => entry.description).join(' · ')}</p>
          ) : null}
          {data.comparison.cadence ? <p className="text-sm text-neutral-600">{CADENCE_LABELS[data.comparison.cadence]}</p> : null}
          {data.comparison.missingCount > 0 || data.comparison.deviationCount > 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {[
                data.comparison.missingCount > 0 ? `${data.comparison.missingCount === 1 ? '1 Monat' : `${data.comparison.missingCount} Monate`} ohne Abbuchung` : null,
                data.comparison.deviationCount > 0 ? `${data.comparison.deviationCount === 1 ? '1 Abbuchung weicht' : `${data.comparison.deviationCount} Abbuchungen weichen`} vom Vertragswert ab` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {data.comparison.months.length > 0 ? (
            <ul className="divide-y divide-neutral-100" aria-label="Abbuchungen je Monat">
              {data.comparison.months.map((entry) => (
                <MonthRow key={entry.month} entry={entry} />
              ))}
            </ul>
          ) : null}
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-accent">Verknüpfte Buchungen ({data.comparison.bookings.length})</summary>
            <ul className="divide-y divide-neutral-100">
              {data.comparison.bookings.slice(0, MAX_BOOKINGS).map((booking) => (
                <li key={booking.id}>
                  <Link to={transactionDetailPath(booking.id)} className="flex min-h-11 items-center justify-between gap-3 py-2">
                    <span className="text-neutral-700">{formatDate(booking.bookingDate)}</span>
                    <span className="tabular-nums text-neutral-900">{formatCurrency(booking.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          {confirmingUnlink ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-neutral-700">Verknüpfung aufheben? Die Buchungen bleiben erhalten und werden neu zugeordnet.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => unlinkContract(contract.id))}
                className="min-h-11 rounded-xl bg-red-600 px-4 font-medium text-white disabled:opacity-60"
              >
                Aufheben
              </button>
              <button
                type="button"
                onClick={() => setConfirmingUnlink(false)}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 font-medium text-neutral-700"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingUnlink(true)} className="min-h-11 self-start text-sm font-medium text-accent">
              Verknüpfung aufheben
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-col text-sm">
          <p className="text-neutral-600">Noch keine Buchung mit diesem Vertrag verknüpft.</p>
          {data.suggestions.length > 0 ? (
            <>
              <p className="mt-3 font-medium text-neutral-900">Passt eine dieser Abbuchungen?</p>
              <ul className="divide-y divide-neutral-100">
                {data.suggestions.map((suggestion) => (
                  <Suggestion
                    key={suggestion.description}
                    suggestion={suggestion}
                    busy={busy}
                    onLink={() => void run(() => linkContract(contract.id, suggestion.draft))}
                  />
                ))}
              </ul>
              <p className="text-xs text-neutral-500">Auch künftig importierte Buchungen mit diesem Merkmal werden dem Vertrag zugeordnet.</p>
            </>
          ) : (
            <p className="mt-2 text-neutral-500">
              Keine passende Abbuchung gefunden. Du kannst eine Buchung auch in ihrer Detailansicht diesem Vertrag zuordnen.
            </p>
          )}
        </div>
      )}
      {actionError ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {actionError}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-neutral-400">Der Vertragswert ist ein Soll – er zählt nie zu den Ausgaben.</p>
    </section>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { contractDetailPath } from '../../../constants/navigation'
import { describeRule, type TransactionDetail } from '../../../domain/usecases/categorization/transactionCategorization'
import { isLinkCandidate, linkContract, linkDraftFor } from '../../../domain/usecases/fixedCosts/contractLinks'

/** Phase 14F: which contract a booking belongs to, or link it to one. */
export function ContractLinkSection({ detail, onLinked }: { detail: TransactionDetail; onLinked: () => void }) {
  const { transaction, contract, contracts } = detail
  const [contractId, setContractId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const draft = linkDraftFor(transaction)

  if (transaction.contractId) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-neutral-900">Vertrag</h2>
        {contract ? (
          <p className="mt-2 text-neutral-600">
            Gehört zum Vertrag{' '}
            <Link to={contractDetailPath(contract.id)} className="font-medium text-accent">
              {contract.provider}
            </Link>
            . Die Verknüpfung verwaltest du beim Vertrag.
          </p>
        ) : (
          <p className="mt-2 text-neutral-600">Der verknüpfte Vertrag ist nicht mehr vorhanden.</p>
        )}
      </section>
    )
  }
  if (!draft || contracts.length === 0 || !isLinkCandidate(transaction, contracts)) return null

  async function handleLink() {
    if (!contractId || !draft) return
    setBusy(true)
    setError(null)
    try {
      await linkContract(contractId, draft)
      onLinked()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Die Verknüpfung konnte nicht gespeichert werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm">
      <label htmlFor="transaction-contract" className="font-semibold text-neutral-900">
        Vertrag zuordnen
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <select
          id="transaction-contract"
          value={contractId}
          onChange={(event) => setContractId(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-neutral-900"
        >
          <option value="">Kein Vertrag</option>
          {contracts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.provider}
              {entry.tariff ? ` – ${entry.tariff}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleLink()}
          disabled={!contractId || busy}
          className="min-h-11 rounded-xl bg-accent px-4 font-medium text-white disabled:opacity-50"
        >
          Zuordnen
        </button>
      </div>
      <p className="mt-2 break-words text-xs text-neutral-500">
        Auch andere und künftige Buchungen mit {describeRule(draft)} werden diesem Vertrag zugeordnet.
      </p>
      {error ? (
        <p className="mt-2 text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

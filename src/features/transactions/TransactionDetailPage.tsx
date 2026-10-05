import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES, transactionDetailPath } from '../../constants/navigation'
import type { FlowType } from '../../domain/models/entities'
import { isProvisionalSettlement } from '../../domain/usecases/bankImport/reconcileCardSettlements'
import {
  CATEGORY_SOURCE_LABELS,
  assignmentOptions,
  choiceOf,
  getTransactionDetail,
  setTransactionAssignment,
  type AssignmentChoice,
  type TransactionDetail,
} from '../../domain/usecases/categorization/transactionCategorization'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { ContractLinkSection } from './components/ContractLinkSection'
import { RulePrompt } from './components/RulePrompt'

const FLOW_LABELS: Record<FlowType, string> = {
  income: 'Einnahme',
  expense: 'Ausgabe',
  transfer: 'Umbuchung – zählt weder als Einnahme noch als Ausgabe',
  saving: 'Sparen – Überweisung auf ein eigenes Spar-/Anlagekonto',
}

function encodeChoice(choice: AssignmentChoice): string {
  return choice.kind === 'category' ? `category:${choice.categoryId}` : choice.kind
}

function decodeChoice(value: string): AssignmentChoice {
  if (value.startsWith('category:')) return { kind: 'category', categoryId: value.slice('category:'.length) }
  return { kind: value as 'saving' | 'transfer' | 'none' }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0 text-neutral-900 [overflow-wrap:anywhere]">{children}</dd>
    </>
  )
}

export function TransactionDetailPage() {
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<TransactionDetail | null | undefined>(undefined)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [promptChoice, setPromptChoice] = useState<Exclude<AssignmentChoice, { kind: 'none' }> | null>(null)

  useEffect(() => {
    let cancelled = false
    getTransactionDetail(id)
      .then((result) => {
        if (!cancelled) setDetail(result ?? null)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadToken])

  if (loadError) return <ErrorState message="Die Buchung konnte nicht geladen werden." onRetry={() => setReloadToken((token) => token + 1)} />
  if (detail === undefined) return <LoadingState />
  if (detail === null) {
    return (
      <>
        <PageHeader title="Buchung nicht gefunden" />
        <Link to={ROUTES.transactions} className="text-sm font-medium text-accent">
          Zu den Buchungen
        </Link>
      </>
    )
  }

  const { transaction, account, category, pair } = detail
  const options = assignmentOptions(detail.categories)
  const title = transaction.counterpartyName || transaction.bookingText || 'Buchung'

  async function handleChange(value: string) {
    const choice = decodeChoice(value)
    setSaving(true)
    setSaveError(null)
    try {
      await setTransactionAssignment(transaction.id, choice)
      setPromptChoice(choice.kind === 'none' ? null : choice)
      setReloadToken((token) => token + 1)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Die Zuordnung konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle={formatDate(transaction.bookingDate)} />
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className={`text-3xl font-semibold tabular-nums ${transaction.amount < 0 ? 'text-neutral-900' : 'text-emerald-700'}`}>
            {formatCurrency(transaction.amount)}
          </p>
          <p className="mt-1 text-sm text-neutral-600">{FLOW_LABELS[transaction.flowType]}</p>
          {transaction.isReversal ? (
            <p className="mt-1 text-sm text-neutral-600">Rücklastschrift – senkt die Ausgaben ihrer Kategorie.</p>
          ) : null}
          {pair ? (
            <p className="mt-2 text-sm text-neutral-600">
              Verknüpft mit{' '}
              <Link to={transactionDetailPath(pair.id)} className="font-medium text-accent">
                {pair.amount > 0 ? 'der Lastschrift der Kreditkarte' : 'der Abrechnung auf dem Girokonto'} vom {formatDate(pair.bookingDate)}
              </Link>
              .
            </p>
          ) : null}
          {isProvisionalSettlement(transaction) ? (
            <p className="mt-2 text-sm text-amber-800">
              Vorläufig als Umbuchung gezählt: Kartenumsätze für diesen Zeitraum sind schon importiert, die passende
              Kreditkarten-Lastschrift noch nicht. Bitte die aktuelle Kreditkarten-CSV importieren.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <label htmlFor="transaction-assignment" className="text-sm font-semibold text-neutral-900">
            Zuordnung
          </label>
          <select
            id="transaction-assignment"
            value={encodeChoice(choiceOf(transaction))}
            disabled={saving}
            onChange={(event) => void handleChange(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
          >
            <option value="none">Ohne Kategorie</option>
            <optgroup label="Ausgaben">
              {options.expense.map((option) => (
                <option key={option.id} value={`category:${option.id}`}>
                  {option.icon} {option.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Einnahmen">
              {options.income.map((option) => (
                <option key={option.id} value={`category:${option.id}`}>
                  {option.icon} {option.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Zählt nicht als Ausgabe">
              <option value="saving">Sparen (eigenes Konto)</option>
              <option value="transfer">Umbuchung</option>
            </optgroup>
            {category && !options.expense.some((option) => option.id === category.id) && !options.income.some((option) => option.id === category.id) && transaction.flowType !== 'saving' ? (
              <option value={`category:${category.id}`}>
                {category.icon} {category.name}
              </option>
            ) : null}
          </select>
          {CATEGORY_SOURCE_LABELS[transaction.categorySource] ? (
            <p className="mt-2 text-xs text-neutral-500">Zuordnung {CATEGORY_SOURCE_LABELS[transaction.categorySource]}.</p>
          ) : null}
          {saveError ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {saveError}
            </p>
          ) : null}
          {promptChoice ? (
            <RulePrompt transaction={transaction} choice={promptChoice} onDone={() => setPromptChoice(null)} />
          ) : null}
        </section>

        <ContractLinkSection key={transaction.contractId ?? 'none'} detail={detail} onLinked={() => setReloadToken((token) => token + 1)} />

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Row label="Konto">{account?.name ?? 'Unbekanntes Konto'}</Row>
            <Row label="Buchungstag">{formatDate(transaction.bookingDate)}</Row>
            {transaction.purchaseDate ? <Row label="Kaufdatum">{formatDate(transaction.purchaseDate)}</Row> : null}
            {transaction.counterpartyName ? <Row label="Gegenpartei">{transaction.counterpartyName}</Row> : null}
            {transaction.counterpartyIban ? <Row label="IBAN">{transaction.counterpartyIban}</Row> : null}
            {transaction.purpose ? (
              <Row label="Verwendungszweck">
                <span className="whitespace-pre-line">{transaction.purpose}</span>
              </Row>
            ) : null}
            {transaction.bookingText ? <Row label="Buchungsart">{transaction.bookingText}</Row> : null}
            {transaction.originalCurrency && transaction.originalAmount !== undefined ? (
              <Row label="Originalbetrag">
                {transaction.originalAmount.toLocaleString('de-DE', { minimumFractionDigits: 2 })} {transaction.originalCurrency}
                {transaction.exchangeRate ? ` · Kurs ${transaction.exchangeRate.toLocaleString('de-DE')}` : ''}
              </Row>
            ) : null}
            {transaction.bankCategory ? <Row label="Kategorie der Sparkasse">{transaction.bankCategory}</Row> : null}
            {transaction.creditorId ? <Row label="Gläubiger-ID">{transaction.creditorId}</Row> : null}
          </dl>
        </section>

        <Link to={ROUTES.transactions} className="min-h-11 self-start py-3 text-sm font-medium text-accent">
          Zu den Buchungen
        </Link>
      </div>
    </>
  )
}

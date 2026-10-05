import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TextField } from '../../../components/form/fields'
import { PageHeader } from '../../../components/layout/PageHeader'
import { ROUTES } from '../../../constants/navigation'
import {
  commitImport,
  prepareImport,
  type ImportCommitResult,
  type ImportPreview,
} from '../../../domain/usecases/bankImport/importTransactions'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import { downloadBackup } from '../../settings/downloadBackup'

type Step =
  | { kind: 'select'; error?: string }
  | { kind: 'reading' }
  | { kind: 'preview'; preview: ImportPreview; accountName: string; saving: boolean; error?: string }
  | { kind: 'done'; result: ImportCommitResult }

const PRIMARY = 'min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-60'
const SECONDARY = 'min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 disabled:opacity-60'
const MAX_LISTED_ERRORS = 5

const FORMAT_LABELS: Record<ImportPreview['format'], string> = {
  sparkasse_giro: 'Sparkasse Girokonto (CSV-CAMT V2)',
  sparkasse_credit_card: 'Sparkasse Kreditkarte',
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900 tabular-nums">{value}</dd>
    </>
  )
}

function PreviewStep({
  step,
  onAccountName,
  onSave,
  onCancel,
}: {
  step: Extract<Step, { kind: 'preview' }>
  onAccountName: (name: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { preview } = step
  const blocked = preview.errors.length > 0
  const nothingNew = preview.counts.new === 0

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Vorschau</h2>
        <p className="mt-1 break-words text-xs text-neutral-500">
          {preview.filename} · {FORMAT_LABELS[preview.format]}
        </p>
        {preview.isNewAccount ? (
          <div className="mt-3">
            <TextField
              id="import-account-name"
              label="Neues Konto"
              value={step.accountName}
              onChange={(event) => onAccountName(event.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">Wird beim Speichern angelegt.</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-700">Konto: {preview.account.name}</p>
        )}
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <SummaryRow
            label="Zeitraum"
            value={preview.periodFrom && preview.periodTo ? `${formatDate(preview.periodFrom)} – ${formatDate(preview.periodTo)}` : '—'}
          />
          <SummaryRow label="Neue Buchungen" value={preview.counts.new} />
          <SummaryRow label="Bereits importiert" value={preview.counts.duplicates} />
          <SummaryRow label="Vorgemerkt (übersprungen)" value={preview.counts.skippedPending} />
          <SummaryRow label="Ohne Kategorie" value={preview.uncategorizedCount} />
          <SummaryRow label="Einnahmen" value={formatCurrency(preview.totals.income)} />
          <SummaryRow label="Ausgaben" value={formatCurrency(preview.totals.expenses)} />
          {preview.totals.saved !== 0 ? <SummaryRow label="Gespart" value={formatCurrency(preview.totals.saved)} /> : null}
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Summen der neuen Buchungen. Umbuchungen zwischen eigenen Konten zählen weder als Einnahme noch als Ausgabe.
        </p>
      </div>

      {blocked ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-medium">
            Die Datei enthält {preview.errors.length === 1 ? 'eine fehlerhafte Zeile' : `${preview.errors.length} fehlerhafte Zeilen`}.
            Es wird nichts importiert.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {preview.errors.slice(0, MAX_LISTED_ERRORS).map((error) => (
              <li key={`${error.line}-${error.message}`}>{error.message}</li>
            ))}
          </ul>
        </div>
      ) : nothingNew ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700" role="status">
          Alle Buchungen dieser Datei sind bereits importiert.
        </p>
      ) : null}

      {step.error ? (
        <p className="text-sm text-red-600" role="alert">
          {step.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!blocked && !nothingNew ? (
          <button type="button" onClick={onSave} disabled={step.saving} className={PRIMARY}>
            {step.saving ? 'Wird gespeichert …' : `${preview.counts.new} Buchungen speichern`}
          </button>
        ) : null}
        <button type="button" onClick={onCancel} disabled={step.saving} className={SECONDARY}>
          {blocked || nothingNew ? 'Zurück' : 'Abbrechen'}
        </button>
      </div>
    </section>
  )
}

function DoneStep({ result, onImportAnother }: { result: ImportCommitResult; onImportAnother: () => void }) {
  const [backup, setBackup] = useState<'idle' | 'running' | 'done' | 'later' | { error: string }>('idle')

  async function handleBackup() {
    setBackup('running')
    try {
      await downloadBackup()
      setBackup('done')
    } catch (caught) {
      setBackup({ error: caught instanceof Error ? caught.message : 'Das Backup konnte nicht erstellt werden.' })
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700" role="status">
        <h2 className="text-base font-semibold text-neutral-900">
          {result.imported === 1 ? '1 Buchung importiert' : `${result.imported} Buchungen importiert`}
        </h2>
        {result.pairedSettlements > 0 ? (
          <p className="mt-2">
            {result.pairedSettlements === 1
              ? '1 Kreditkartenabrechnung wurde mit den Kartenumsätzen verknüpft'
              : `${result.pairedSettlements} Kreditkartenabrechnungen wurden mit den Kartenumsätzen verknüpft`}{' '}
            – sie zählen nicht als Ausgabe, nur die einzelnen Kartenumsätze.
          </p>
        ) : null}
        {result.cardDataFrom ? (
          <p className="mt-2">
            Einzelumsätze dieser Karte liegen ab dem {formatDate(result.cardDataFrom)} vor. Ältere Kartenabrechnungen
            zählen als „Kreditkarte (nicht aufgeschlüsselt)“; die erste verknüpfte Abrechnung kann unvollständig sein.
          </p>
        ) : null}
        {result.provisionalSettlements > 0 ? (
          <p className="mt-2 text-amber-800">
            Für {result.provisionalSettlements === 1 ? '1 Kreditkartenabrechnung' : `${result.provisionalSettlements} Kreditkartenabrechnungen`}{' '}
            fehlen noch die Kartenumsätze – bitte die aktuelle Kreditkarten-CSV importieren.
          </p>
        ) : null}
      </div>

      {backup !== 'later' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-neutral-800">
          <p className="font-medium text-neutral-900">Backup erstellen?</p>
          <p className="mt-1">
            Deine Buchungen liegen nur auf diesem Gerät und werden nicht synchronisiert. Ein Backup ist ihre einzige
            Sicherung.
          </p>
          {backup === 'done' ? (
            <p className="mt-2 font-medium" role="status">
              Backup wurde heruntergeladen.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleBackup} disabled={backup === 'running'} className={PRIMARY}>
                {backup === 'running' ? 'Backup wird erstellt …' : 'Backup erstellen'}
              </button>
              <button type="button" onClick={() => setBackup('later')} className={SECONDARY}>
                Später
              </button>
            </div>
          )}
          {typeof backup === 'object' ? (
            <p className="mt-2 text-red-600" role="alert">
              {backup.error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onImportAnother} className={SECONDARY}>
          Weitere Datei importieren
        </button>
        <Link to={ROUTES.transactions} className="min-h-11 py-3 text-sm font-medium text-accent">
          Zu den Buchungen
        </Link>
      </div>
    </section>
  )
}

export function ImportTransactionsPage() {
  const [step, setStep] = useState<Step>({ kind: 'select' })
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function handleFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setStep({ kind: 'reading' })
    try {
      const result = await prepareImport(file)
      setStep(
        result.ok
          ? { kind: 'preview', preview: result.preview, accountName: result.preview.account.name, saving: false }
          : { kind: 'select', error: result.error },
      )
    } catch {
      setStep({ kind: 'select', error: 'Diese Datei konnte nicht gelesen werden.' })
    }
  }

  async function handleSave() {
    if (step.kind !== 'preview') return
    setStep({ ...step, saving: true, error: undefined })
    try {
      const result = await commitImport(step.preview, step.accountName)
      setStep({ kind: 'done', result })
    } catch (caught) {
      setStep({ ...step, saving: false, error: caught instanceof Error ? caught.message : 'Der Import ist fehlgeschlagen.' })
    }
  }

  return (
    <>
      <PageHeader title="Buchungen importieren" subtitle="Sparkassen-Umsätze als CSV-Datei" />
      {step.kind === 'select' || step.kind === 'reading' ? (
        <section className="flex flex-col gap-3">
          <label
            htmlFor="transaction-import-file"
            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-6 text-center"
          >
            <span className="text-sm font-medium text-accent">
              {step.kind === 'reading' ? 'Datei wird gelesen …' : 'CSV-Datei auswählen'}
            </span>
            <span className="text-xs text-neutral-500">
              Girokonto: „Excel (CSV-CAMT V2)“ · Kreditkarte: CSV-Export der Sparkasse
            </span>
            <input
              ref={inputRef}
              id="transaction-import-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={step.kind === 'reading'}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
          <p className="text-xs text-neutral-500">
            Die Datei wird nur auf diesem Gerät gelesen und nicht gespeichert – gespeichert werden erst die Buchungen,
            nachdem du die Vorschau bestätigt hast.
          </p>
          {step.kind === 'select' && step.error ? (
            <p className="text-sm text-red-600" role="alert">
              {step.error}
            </p>
          ) : null}
        </section>
      ) : null}

      {step.kind === 'preview' ? (
        <PreviewStep
          step={step}
          onAccountName={(accountName) => setStep({ ...step, accountName })}
          onSave={() => void handleSave()}
          onCancel={() => navigate(ROUTES.transactions)}
        />
      ) : null}

      {step.kind === 'done' ? <DoneStep result={step.result} onImportAnother={() => setStep({ kind: 'select' })} /> : null}
    </>
  )
}

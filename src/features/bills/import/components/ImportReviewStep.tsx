import type { FormEvent } from 'react'
import { FormError, TextField } from '../../../../components/form/fields'
import { calculateBillBalance } from '../../../../domain/usecases/bills'
import type { Category } from '../../../../domain/models/entities'
import { formatCurrency } from '../../../../utils/formatters'
import { parseGermanAmount, roundToCents } from '../../../../utils/money'
import type { EditableField } from '../importTypes'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ImportItemRow, type ImportItemRowState } from './ImportItemRow'
import { SourceTextDisclosure } from './SourceTextDisclosure'

interface ImportReviewStepProps {
  filename: string
  rawText: string
  year: EditableField<string>
  periodStart: EditableField<string>
  periodEnd: EditableField<string>
  totalAmount: EditableField<string>
  advancePayments: EditableField<string>
  items: ImportItemRowState[]
  categories: Category[]
  categoriesLoading: boolean
  saving: boolean
  errors: string[]
  onChangeYear: (value: string) => void
  onChangePeriodStart: (value: string) => void
  onChangePeriodEnd: (value: string) => void
  onChangeTotalAmount: (value: string) => void
  onChangeAdvancePayments: (value: string) => void
  onChangeItem: (index: number, next: ImportItemRowState) => void
  onAddItem: () => void
  onRemoveItem: (index: number) => void
  onCancel: () => void
  onSubmit: (event: FormEvent) => void
}

export function ImportReviewStep({
  filename,
  rawText,
  year,
  periodStart,
  periodEnd,
  totalAmount,
  advancePayments,
  items,
  categories,
  categoriesLoading,
  saving,
  errors,
  onChangeYear,
  onChangePeriodStart,
  onChangePeriodEnd,
  onChangeTotalAmount,
  onChangeAdvancePayments,
  onChangeItem,
  onAddItem,
  onRemoveItem,
  onCancel,
  onSubmit,
}: ImportReviewStepProps) {
  const itemsSum = roundToCents(
    items.reduce((sum, item) => sum + (parseGermanAmount(item.amountText) ?? 0), 0),
  )
  const recognizedTotal = parseGermanAmount(totalAmount.value)
  const hasDiscrepancy = recognizedTotal !== null && roundToCents(itemsSum - recognizedTotal) !== 0

  // Nachzahlung/Guthaben previews the value that will actually be saved as
  // the Bill's totalAmount (the confirmed/edited total when present, the
  // item sum otherwise) - never a number that differs from what "Abrechnung
  // speichern" persists.
  const advancePaymentsValue = parseGermanAmount(advancePayments.value) ?? 0
  const { balance, balanceType } = calculateBillBalance(recognizedTotal ?? itemsSum, advancePaymentsValue)

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
        <p className="text-xs text-neutral-500">Originaldokument</p>
        <p className="font-medium text-neutral-900">{filename}</p>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Die erkannten Daten wurden automatisch aus dem Dokument übernommen. Bitte prüfe die Angaben vor dem
        Speichern.
      </div>

      <FormError errors={errors} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="import-year" className="text-sm font-medium text-neutral-700">
            Abrechnungsjahr
          </label>
          <ConfidenceBadge confidence={year.confidence} manuallyVerified={year.manuallyVerified} />
        </div>
        <input
          id="import-year"
          type="number"
          value={year.value}
          onChange={(event) => onChangeYear(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <SourceTextDisclosure sourceText={year.sourceText} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="import-period-start" className="text-sm font-medium text-neutral-700">
              Zeitraum von
            </label>
          </div>
          <input
            id="import-period-start"
            type="date"
            value={periodStart.value}
            onChange={(event) => onChangePeriodStart(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <TextField
          id="import-period-end"
          label="Zeitraum bis"
          type="date"
          value={periodEnd.value}
          onChange={(event) => onChangePeriodEnd(event.target.value)}
        />
      </div>
      <ConfidenceBadge confidence={periodStart.confidence} manuallyVerified={periodStart.manuallyVerified} />
      <SourceTextDisclosure sourceText={periodStart.sourceText} />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="import-total" className="text-sm font-medium text-neutral-700">
            Erkannte Gesamtsumme
          </label>
          <ConfidenceBadge confidence={totalAmount.confidence} manuallyVerified={totalAmount.manuallyVerified} />
        </div>
        <div className="relative">
          <input
            id="import-total"
            type="text"
            inputMode="decimal"
            value={totalAmount.value}
            onChange={(event) => onChangeTotalAmount(event.target.value)}
            placeholder="0,00"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 pr-8 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-neutral-400">€</span>
        </div>
        <SourceTextDisclosure sourceText={totalAmount.sourceText} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="import-advance" className="text-sm font-medium text-neutral-700">
            Vorauszahlungen
          </label>
          <ConfidenceBadge confidence={advancePayments.confidence} manuallyVerified={advancePayments.manuallyVerified} />
        </div>
        <div className="relative">
          <input
            id="import-advance"
            type="text"
            inputMode="decimal"
            value={advancePayments.value}
            onChange={(event) => onChangeAdvancePayments(event.target.value)}
            placeholder="0,00"
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 pr-8 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-neutral-400">€</span>
        </div>
        <SourceTextDisclosure sourceText={advancePayments.sourceText} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">Kostenpositionen</p>
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <ImportItemRow
              key={item.key}
              item={item}
              categories={categories}
              onChange={(next) => onChangeItem(index, next)}
              onRemove={() => onRemoveItem(index)}
              removeDisabled={categoriesLoading || items.length <= 1}
            />
          ))}
        </div>
        <button type="button" onClick={onAddItem} className="mt-2 min-h-11 text-sm font-medium text-accent">
          + Kostenposition
        </button>
      </div>

      {hasDiscrepancy && recognizedTotal !== null ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Die Kostenpositionen ergeben {formatCurrency(itemsSum)}, die erkannte Gesamtsumme beträgt{' '}
          {formatCurrency(recognizedTotal)}. Differenz: {formatCurrency(Math.abs(itemsSum - recognizedTotal))}. Du
          kannst trotzdem speichern.
        </div>
      ) : null}

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Summe Kostenpositionen</span>
          <span className="font-semibold text-neutral-900">{formatCurrency(itemsSum)}</span>
        </div>
        {balanceType !== 'none' && (
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-neutral-500">{balanceType === 'payment_due' ? 'Nachzahlung' : 'Guthaben'}</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(balance)}</span>
          </div>
        )}
      </div>

      <details className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <summary className="cursor-pointer select-none font-medium text-neutral-700">OCR-Text anzeigen</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 font-mono text-xs text-neutral-600">
          {rawText || 'Kein Text erkannt.'}
        </pre>
      </details>

      <div className="sticky bottom-20 z-10 -mx-4 flex gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-none lg:bg-transparent lg:p-0">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Speichert …' : 'Abrechnung speichern'}
        </button>
      </div>
    </form>
  )
}

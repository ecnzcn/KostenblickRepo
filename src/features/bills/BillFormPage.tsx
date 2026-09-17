import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/feedback/useToast'
import { FormActions, FormError, MoneyField, SelectField, TextField } from '../../components/form/fields'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import type { BillType } from '../../domain/models/entities'
import {
  BILL_TYPE_LABELS,
  calculateBillBalance,
  createBillWithItems,
  getBill,
  listBillItems,
  updateBillWithItems,
  validateBillInput,
} from '../../domain/usecases/bills'
import { useCategories } from '../../hooks/useCategories'
import { formatCurrency } from '../../utils/formatters'
import { parseGermanAmount } from '../../utils/money'
import { BillItemRow, type BillItemRowState } from './components/BillItemRow'

interface BillFormPageProps {
  mode: 'create' | 'edit'
}

const BILL_TYPE_OPTIONS = (Object.keys(BILL_TYPE_LABELS) as BillType[]).map((value) => ({
  value,
  label: BILL_TYPE_LABELS[value],
}))

let rowCounter = 0
function newRow(): BillItemRowState {
  rowCounter += 1
  return { key: `row-${rowCounter}`, categoryId: '', description: '', amountText: '' }
}

export function BillFormPage({ mode }: BillFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { categories, loading: categoriesLoading } = useCategories()

  const [type, setType] = useState<BillType>('annual_statement')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [advancePaymentsText, setAdvancePaymentsText] = useState('')
  const [items, setItems] = useState<BillItemRowState[]>([newRow()])

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState(false)

  // Whether the loaded Bill has a deliberately confirmed totalAmount (e.g.
  // from a reviewed import) and its value - fixed at load time, not
  // recomputed as items change. recalculateRequested is the explicit,
  // user-triggered opt-out of keeping it (see "Aus Positionen neu
  // berechnen" below); editing items alone never sets it.
  const [confirmedTotalAmount, setConfirmedTotalAmount] = useState<number | undefined>(undefined)
  const [recalculateRequested, setRecalculateRequested] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    Promise.all([getBill(id), listBillItems(id)])
      .then(([bill, billItems]) => {
        if (cancelled) return
        if (!bill) {
          setLoadError(true)
          return
        }
        setType(bill.type)
        setConfirmedTotalAmount(bill.totalAmountConfirmed === true ? bill.totalAmount : undefined)
        setYear(bill.year.toString())
        setPeriodStart(bill.periodStart?.slice(0, 10) ?? '')
        setPeriodEnd(bill.periodEnd?.slice(0, 10) ?? '')
        setAdvancePaymentsText(bill.advancePayments.toString().replace('.', ','))
        setItems(
          billItems.length > 0
            ? billItems.map((item) => ({
                key: item.id,
                categoryId: item.categoryId ?? '',
                description: item.description,
                amountText: item.amount.toString().replace('.', ','),
              }))
            : [newRow()],
        )
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, id])

  const itemSum = useMemo(
    () => items.reduce((sum, item) => sum + (parseGermanAmount(item.amountText) ?? 0), 0),
    [items],
  )
  const totalAmount = confirmedTotalAmount !== undefined && !recalculateRequested ? confirmedTotalAmount : itemSum
  const advancePayments = parseGermanAmount(advancePaymentsText) ?? 0
  const { balance, balanceType } = calculateBillBalance(totalAmount, advancePayments)

  function updateItem(index: number, next: BillItemRowState) {
    setItems((current) => current.map((item, i) => (i === index ? next : item)))
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const parsedAdvancePayments = parseGermanAmount(advancePaymentsText)
    const parsedItems = items.map((item) => ({
      categoryId: item.categoryId,
      description: item.description,
      amount: parseGermanAmount(item.amountText) ?? Number.NaN,
    }))

    const input = {
      type,
      year: Number(year),
      periodStart: periodStart ? new Date(`${periodStart}T00:00:00.000Z`).toISOString() : undefined,
      periodEnd: periodEnd ? new Date(`${periodEnd}T00:00:00.000Z`).toISOString() : undefined,
      advancePayments: parsedAdvancePayments ?? Number.NaN,
      items: parsedItems,
      recalculateTotalAmount: recalculateRequested,
    }

    const validationErrors = validateBillInput(input)
    if (parsedAdvancePayments === null) validationErrors.push('Vorauszahlungen konnten nicht gelesen werden.')
    if (parsedItems.some((item) => Number.isNaN(item.amount))) {
      validationErrors.push('Mindestens eine Kostenposition hat einen ungültigen Betrag.')
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)
    try {
      if (mode === 'edit' && id) {
        await updateBillWithItems(id, input)
      } else {
        await createBillWithItems(input)
      }
      showToast('Abrechnung gespeichert')
      navigate(ROUTES.bills)
    } catch {
      setErrors(['Die Daten konnten nicht gespeichert werden. Bitte versuche es erneut.'])
    } finally {
      setSaving(false)
    }
  }

  if (loadingExisting) return <LoadingState />
  if (loadError) return <p className="text-sm text-red-700">Abrechnung wurde nicht gefunden.</p>

  return (
    <>
      <PageHeader title={mode === 'edit' ? 'Abrechnung bearbeiten' : 'Abrechnung erfassen'} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError errors={errors} />
        <SelectField
          id="bill-type"
          label="Abrechnungstyp"
          options={BILL_TYPE_OPTIONS}
          value={type}
          onChange={(event) => setType(event.target.value as BillType)}
          required
        />
        <TextField id="bill-year" label="Abrechnungsjahr" type="number" value={year} onChange={(e) => setYear(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <TextField id="bill-period-start" label="Zeitraum von" optional type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <TextField id="bill-period-end" label="Zeitraum bis" optional type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <MoneyField id="bill-advance-payments" label="Vorauszahlungen" value={advancePaymentsText} onChange={setAdvancePaymentsText} />

        <div>
          <p className="mb-2 text-sm font-medium text-neutral-700">Kostenpositionen</p>
          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <BillItemRow
                key={item.key}
                item={item}
                categories={categories}
                onChange={(next) => updateItem(index, next)}
                onRemove={() => removeItem(index)}
                removeDisabled={categoriesLoading || items.length <= 1}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems((current) => [...current, newRow()])}
            className="mt-2 min-h-11 text-sm font-medium text-accent"
          >
            + Kostenposition
          </button>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          {confirmedTotalAmount !== undefined && !recalculateRequested ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Bestätigter Gesamtbetrag</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(confirmedTotalAmount)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-neutral-500">Positionssumme</span>
                <span className="text-neutral-700">{formatCurrency(itemSum)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-neutral-500">Differenz</span>
                <span className="text-neutral-700">{formatCurrency(confirmedTotalAmount - itemSum)}</span>
              </div>
              <button
                type="button"
                onClick={() => setRecalculateRequested(true)}
                className="mt-3 min-h-11 w-full rounded-xl border border-neutral-200 text-sm font-medium text-accent"
              >
                Aus Positionen neu berechnen
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Gesamt</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(totalAmount)}</span>
            </div>
          )}
          {balanceType !== 'none' && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-neutral-500">{balanceType === 'payment_due' ? 'Nachzahlung' : 'Guthaben'}</span>
              <span className="font-semibold text-neutral-900">{formatCurrency(balance)}</span>
            </div>
          )}
        </div>

        <FormActions onCancel={() => navigate(ROUTES.bills)} saving={saving} />
      </form>
    </>
  )
}

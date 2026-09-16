import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/feedback/useToast'
import {
  CheckboxField,
  FormActions,
  FormError,
  MoneyField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/form/fields'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import type { CancellationUnit } from '../../domain/models/entities'
import { calculateCancellationDate } from '../../domain/usecases/cancellationDate'
import { createContract, getContract, updateContract, validateContractInput } from '../../domain/usecases/contracts'
import { useCategories } from '../../hooks/useCategories'
import { formatDate } from '../../utils/formatters'
import { parseGermanAmount } from '../../utils/money'

interface ContractFormPageProps {
  mode: 'create' | 'edit'
}

const CANCELLATION_UNIT_OPTIONS: { value: CancellationUnit; label: string }[] = [
  { value: 'days', label: 'Tage' },
  { value: 'weeks', label: 'Wochen' },
  { value: 'months', label: 'Monate' },
  { value: 'years', label: 'Jahre' },
]

export function ContractFormPage({ mode }: ContractFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { categories, loading: categoriesLoading } = useCategories()

  const [categoryId, setCategoryId] = useState('')
  const [provider, setProvider] = useState('')
  const [tariff, setTariff] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [monthlyCostText, setMonthlyCostText] = useState('')
  const [yearlyCostText, setYearlyCostText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [cancellationValueText, setCancellationValueText] = useState('')
  const [cancellationUnit, setCancellationUnit] = useState<CancellationUnit | ''>('')
  const [autoRenewal, setAutoRenewal] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [notes, setNotes] = useState('')

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    getContract(id)
      .then((contract) => {
        if (cancelled) return
        if (!contract) {
          setLoadError(true)
          return
        }
        setCategoryId(contract.categoryId)
        setProvider(contract.provider)
        setTariff(contract.tariff ?? '')
        setContractNumber(contract.contractNumber ?? '')
        setMonthlyCostText(contract.monthlyCost.toString().replace('.', ','))
        setYearlyCostText(contract.yearlyCost !== undefined ? contract.yearlyCost.toString().replace('.', ',') : '')
        setStartDate(contract.startDate.slice(0, 10))
        setEndDate(contract.endDate?.slice(0, 10) ?? '')
        setCancellationValueText(contract.cancellationPeriodValue?.toString() ?? '')
        setCancellationUnit(contract.cancellationPeriodUnit ?? '')
        setAutoRenewal(contract.autoRenewal)
        setReminderEnabled(contract.reminderEnabled)
        setNotes(contract.notes ?? '')
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, id])

  const cancellationValue = cancellationValueText ? Number(cancellationValueText) : undefined
  const previewCancellationDate = useMemo(() => {
    if (!endDate || cancellationValue === undefined || !cancellationUnit || Number.isNaN(cancellationValue)) {
      return undefined
    }
    return calculateCancellationDate(`${endDate}T00:00:00.000Z`, cancellationValue, cancellationUnit)
  }, [endDate, cancellationValue, cancellationUnit])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const monthlyCost = parseGermanAmount(monthlyCostText)
    const yearlyCost = yearlyCostText ? parseGermanAmount(yearlyCostText) : null

    const input = {
      categoryId,
      provider,
      tariff: tariff || undefined,
      contractNumber: contractNumber || undefined,
      monthlyCost: monthlyCost ?? Number.NaN,
      yearlyCost: yearlyCost === null ? undefined : yearlyCost,
      startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`).toISOString() : '',
      endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`).toISOString() : undefined,
      cancellationPeriodValue: cancellationValue,
      cancellationPeriodUnit: cancellationUnit || undefined,
      autoRenewal,
      reminderEnabled,
      notes: notes || undefined,
    }

    const validationErrors = validateContractInput(input)
    if (monthlyCost === null) validationErrors.push('Monatliche Kosten konnten nicht gelesen werden.')
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)
    try {
      if (mode === 'edit' && id) {
        await updateContract(id, input)
      } else {
        await createContract(input)
      }
      showToast('Vertrag gespeichert')
      navigate(ROUTES.contracts)
    } catch {
      setErrors(['Die Daten konnten nicht gespeichert werden. Bitte versuche es erneut.'])
    } finally {
      setSaving(false)
    }
  }

  if (loadingExisting) return <LoadingState />
  if (loadError) return <p className="text-sm text-red-700">Vertrag wurde nicht gefunden.</p>

  return (
    <>
      <PageHeader title={mode === 'edit' ? 'Vertrag bearbeiten' : 'Vertrag hinzufügen'} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError errors={errors} />
        <TextField id="contract-provider" label="Anbieter" value={provider} onChange={(e) => setProvider(e.target.value)} required />
        <TextField id="contract-tariff" label="Tarif" optional value={tariff} onChange={(e) => setTariff(e.target.value)} />
        <SelectField
          id="contract-category"
          label="Kategorie"
          placeholder={categoriesLoading ? 'Kategorien werden geladen …' : 'Kategorie wählen'}
          options={categories.map((category) => ({ value: category.id, label: `${category.icon} ${category.name}` }))}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
        />
        <TextField
          id="contract-number"
          label="Vertragsnummer"
          optional
          value={contractNumber}
          onChange={(e) => setContractNumber(e.target.value)}
        />
        <MoneyField id="contract-monthly-cost" label="Monatliche Kosten" value={monthlyCostText} onChange={setMonthlyCostText} />
        <MoneyField
          id="contract-yearly-cost"
          label="Jährliche Kosten"
          optional
          placeholder="automatisch: Monatskosten × 12"
          value={yearlyCostText}
          onChange={setYearlyCostText}
        />
        <TextField id="contract-start" label="Vertragsbeginn" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <TextField id="contract-end" label="Vertragsende" optional type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="contract-cancellation-value"
            label="Kündigungsfrist"
            optional
            type="number"
            min={0}
            value={cancellationValueText}
            onChange={(e) => setCancellationValueText(e.target.value)}
          />
          <SelectField
            id="contract-cancellation-unit"
            label="Einheit"
            optional
            placeholder="Einheit wählen"
            options={CANCELLATION_UNIT_OPTIONS}
            value={cancellationUnit}
            onChange={(e) => setCancellationUnit(e.target.value as CancellationUnit)}
          />
        </div>

        {previewCancellationDate ? (
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-neutral-700">
            Kündigung spätestens am <strong>{formatDate(previewCancellationDate)}</strong>
          </div>
        ) : null}

        <CheckboxField id="contract-auto-renewal" label="Verlängert sich automatisch" checked={autoRenewal} onChange={setAutoRenewal} />
        <CheckboxField
          id="contract-reminder"
          label="An Kündigungsfrist erinnern"
          checked={reminderEnabled}
          onChange={setReminderEnabled}
        />

        <TextAreaField id="contract-notes" label="Notiz" optional value={notes} onChange={(e) => setNotes(e.target.value)} />

        <FormActions onCancel={() => navigate(ROUTES.contracts)} saving={saving} />
      </form>
    </>
  )
}

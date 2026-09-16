import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/feedback/useToast'
import { FormActions, FormError, MoneyField, SelectField, TextAreaField, TextField } from '../../components/form/fields'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import { createCostEntry, getCostEntry, updateCostEntry, validateCostEntryInput } from '../../domain/usecases/costs'
import { useCategories } from '../../hooks/useCategories'
import { parseGermanAmount } from '../../utils/money'

interface CostFormPageProps {
  mode: 'create' | 'edit'
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

export function CostFormPage({ mode }: CostFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { categories, loading: categoriesLoading } = useCategories()

  const [categoryId, setCategoryId] = useState('')
  const [amountText, setAmountText] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [period, setPeriod] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    getCostEntry(id)
      .then((entry) => {
        if (cancelled) return
        if (!entry) {
          setLoadError(true)
          return
        }
        setCategoryId(entry.categoryId)
        setAmountText(entry.amount.toString().replace('.', ','))
        setDate(entry.date.slice(0, 10))
        setPeriod(entry.period ?? '')
        setNotes(entry.notes ?? '')
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, id])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const amount = parseGermanAmount(amountText)
    const input = {
      categoryId,
      amount: amount ?? Number.NaN,
      date: date ? new Date(`${date}T00:00:00.000Z`).toISOString() : '',
      period: period || undefined,
      notes: notes || undefined,
    }

    const validationErrors = validateCostEntryInput(input)
    if (amount === null) validationErrors.push('Betrag konnte nicht gelesen werden.')
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)
    try {
      if (mode === 'edit' && id) {
        await updateCostEntry(id, input)
      } else {
        await createCostEntry(input)
      }
      showToast('Kosten gespeichert')
      navigate(ROUTES.costs)
    } catch {
      setErrors(['Die Daten konnten nicht gespeichert werden. Bitte versuche es erneut.'])
    } finally {
      setSaving(false)
    }
  }

  if (loadingExisting) return <LoadingState />
  if (loadError) return <p className="text-sm text-red-700">Kosteneintrag wurde nicht gefunden.</p>

  return (
    <>
      <PageHeader title={mode === 'edit' ? 'Kosten bearbeiten' : 'Kosten erfassen'} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError errors={errors} />
        <SelectField
          id="cost-category"
          label="Kategorie"
          placeholder={categoriesLoading ? 'Kategorien werden geladen …' : 'Kategorie wählen'}
          options={categories.map((category) => ({ value: category.id, label: `${category.icon} ${category.name}` }))}
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          required
        />
        <MoneyField id="cost-amount" label="Betrag" value={amountText} onChange={setAmountText} />
        <TextField
          id="cost-date"
          label="Datum"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        <TextField
          id="cost-period"
          label="Zeitraum"
          type="month"
          optional
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        />
        <TextAreaField
          id="cost-notes"
          label="Notiz"
          optional
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <FormActions onCancel={() => navigate(ROUTES.costs)} saving={saving} />
      </form>
    </>
  )
}

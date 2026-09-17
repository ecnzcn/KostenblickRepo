import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../components/layout/PageHeader'
import { useToast } from '../../../components/feedback/useToast'
import { billDetailPath, ROUTES } from '../../../constants/navigation'
import type { Document } from '../../../domain/models/entities'
import type { ParsedBillItem } from '../../../domain/models/ocr'
import { createBillWithItems } from '../../../domain/usecases/bills'
import { deleteDocument, saveDocumentFile, validateDocumentFile } from '../../../domain/usecases/documents'
import { useCategories } from '../../../hooks/useCategories'
import { OCRCancelledError } from '../../../services/ocr/OCRCancelledError'
import type { OCRProgress } from '../../../services/ocr/OCRService'
import { ocrService } from '../../../services/ocr/activeOcrService'
import { generateId } from '../../../utils/id'
import { parseGermanAmount } from '../../../utils/money'
import { ImportProcessingStep } from './components/ImportProcessingStep'
import type { ImportItemRowState } from './components/ImportItemRow'
import { ImportReviewStep } from './components/ImportReviewStep'
import { ImportSelectStep } from './components/ImportSelectStep'
import { editedField, type EditableField } from './importTypes'

type Step = 'select' | 'processing' | 'review'

function toAmountText(value: number | undefined): string {
  return value !== undefined ? value.toFixed(2).replace('.', ',') : ''
}

function toItemRow(item: ParsedBillItem): ImportItemRowState {
  return {
    key: generateId(),
    categoryId: item.categoryId,
    description: item.description,
    amountText: toAmountText(item.amount),
    confidence: item.confidence,
    sourceText: item.sourceText,
    manuallyVerified: false,
  }
}

function emptyItemRow(): ImportItemRowState {
  return { key: generateId(), categoryId: '', description: '', amountText: '', confidence: 1, manuallyVerified: true }
}

/**
 * Wizard: select a file → run it through OCR/parsing → review & correct →
 * confirm. Nothing is persisted as a finished Bill until the user explicitly
 * saves in the review step; only the Document (original file) is saved
 * earlier so it can be linked once the Bill is confirmed. If the user
 * cancels (before confirming, or mid-OCR), that orphaned Document is
 * cleaned up again and no partial Bill/BillItems are ever written.
 */
export function ImportBillPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { categories, loading: categoriesLoading } = useCategories()

  const [step, setStep] = useState<Step>('select')
  const [file, setFile] = useState<File>()
  const [fileError, setFileError] = useState<string>()
  const [progress, setProgress] = useState<OCRProgress>({ stage: 'loading' })
  const [savedDocument, setSavedDocument] = useState<Document>()
  const [rawText, setRawText] = useState('')

  const [year, setYearField] = useState<EditableField<string>>({ value: '', confidence: 0, manuallyVerified: false })
  const [periodStart, setPeriodStartField] = useState<EditableField<string>>({ value: '', confidence: 0, manuallyVerified: false })
  const [periodEnd, setPeriodEndField] = useState<EditableField<string>>({ value: '', confidence: 0, manuallyVerified: false })
  const [totalAmount, setTotalAmountField] = useState<EditableField<string>>({ value: '', confidence: 0, manuallyVerified: false })
  const [advancePayments, setAdvancePaymentsField] = useState<EditableField<string>>({ value: '', confidence: 0, manuallyVerified: false })
  const [items, setItems] = useState<ImportItemRowState[]>([])

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const abortControllerRef = useRef<AbortController | undefined>(undefined)

  // Releases the OCR engine's worker/WASM memory once the import screen is
  // left, whatever the outcome - important on memory-constrained phones.
  useEffect(() => {
    return () => {
      void ocrService.dispose?.()
    }
  }, [])

  function handleSelect(nextFile: File | undefined) {
    setFile(nextFile)
    setFileError(nextFile ? validateDocumentFile(nextFile)[0] : undefined)
  }

  async function handleStartProcessing() {
    if (!file) return
    setStep('processing')
    setProgress({ stage: 'loading', message: 'Dokument wird vorbereitet …' })

    // Created before any async work starts (including saving the document)
    // so "Abbrechen" is responsive the instant the processing screen
    // appears - previously it was created only after saveDocumentFile()
    // resolved, so a cancel click during that (normally brief, but not
    // always negligible) window was silently dropped.
    const controller = new AbortController()
    abortControllerRef.current = controller

    let createdDocument: Document
    try {
      createdDocument = await saveDocumentFile(file, 'bill')
      setSavedDocument(createdDocument)
    } catch {
      setFileError('Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.')
      setStep('select')
      abortControllerRef.current = undefined
      return
    }

    if (controller.signal.aborted) {
      // Cancelled while the document was still being saved.
      try {
        await deleteDocument(createdDocument.id)
      } catch {
        // Best-effort cleanup - nothing was ever linked to a Bill.
      }
      setSavedDocument(undefined)
      setStep('select')
      abortControllerRef.current = undefined
      return
    }

    try {
      const parsed = await ocrService.extractBillData(file, {
        signal: controller.signal,
        onProgress: setProgress,
      })

      setRawText(parsed.rawText)
      setYearField({
        value: parsed.year.value?.toString() ?? '',
        confidence: parsed.year.confidence,
        manuallyVerified: false,
        sourceText: parsed.year.sourceText,
      })
      setPeriodStartField({
        value: parsed.periodStart.value?.slice(0, 10) ?? '',
        confidence: parsed.periodStart.confidence,
        manuallyVerified: false,
        sourceText: parsed.periodStart.sourceText,
      })
      setPeriodEndField({
        value: parsed.periodEnd.value?.slice(0, 10) ?? '',
        confidence: parsed.periodEnd.confidence,
        manuallyVerified: false,
        sourceText: parsed.periodEnd.sourceText,
      })
      setTotalAmountField({
        value: toAmountText(parsed.totalAmount.value),
        confidence: parsed.totalAmount.confidence,
        manuallyVerified: false,
        sourceText: parsed.totalAmount.sourceText,
      })
      setAdvancePaymentsField({
        value: toAmountText(parsed.advancePayments.value),
        confidence: parsed.advancePayments.confidence,
        manuallyVerified: false,
        sourceText: parsed.advancePayments.sourceText,
      })
      setItems(parsed.items.length > 0 ? parsed.items.map(toItemRow) : [emptyItemRow()])

      const nothingRecognized =
        parsed.year.value === undefined && parsed.totalAmount.value === undefined && parsed.items.length === 0
      setErrors(
        nothingRecognized
          ? ['Der Text konnte nicht zuverlässig erkannt werden. Bitte gib die Angaben manuell ein.']
          : [],
      )
      setStep('review')
    } catch (error) {
      const cancelled = error instanceof OCRCancelledError
      if (!cancelled) {
        // Technical details only - never the document's OCR text/content.
        console.error('OCR extraction failed', error)
      }
      try {
        await deleteDocument(createdDocument.id)
      } catch {
        // Best-effort cleanup - nothing was ever linked to a Bill.
      }
      setSavedDocument(undefined)
      if (!cancelled) {
        setFileError(
          'Die Abrechnung konnte nicht automatisch analysiert werden. Bitte versuche es erneut oder gib die Daten manuell ein.',
        )
      }
      setStep('select')
    } finally {
      abortControllerRef.current = undefined
    }
  }

  function handleCancelProcessing() {
    abortControllerRef.current?.abort()
  }

  async function handleCancelReview() {
    if (savedDocument) {
      try {
        await deleteDocument(savedDocument.id)
      } catch {
        // Best-effort cleanup; nothing was ever linked to a Bill, so there is nothing to roll back.
      }
    }
    navigate(ROUTES.bills)
  }

  function updateItem(index: number, next: ImportItemRowState) {
    setItems((current) => current.map((item, i) => (i === index ? next : item)))
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!savedDocument) return

    const parsedYear = Number(year.value)
    const parsedAdvancePayments = parseGermanAmount(advancePayments.value)
    const totalAmountText = totalAmount.value.trim()
    const parsedTotalAmount = totalAmountText ? parseGermanAmount(totalAmountText) : null
    const parsedItems = items.map((item) => ({
      categoryId: item.categoryId,
      description: item.description,
      amount: parseGermanAmount(item.amountText) ?? Number.NaN,
      confidence: item.confidence,
      sourceText: item.sourceText,
      manuallyVerified: item.manuallyVerified,
    }))

    const validationErrors: string[] = []
    if (!Number.isInteger(parsedYear)) validationErrors.push('Abrechnungsjahr ist ungültig.')
    if (parsedAdvancePayments === null) validationErrors.push('Vorauszahlungen konnten nicht gelesen werden.')
    if (totalAmountText && parsedTotalAmount === null) validationErrors.push('Erkannte Gesamtsumme konnte nicht gelesen werden.')
    for (const item of parsedItems) {
      if (!item.categoryId) validationErrors.push('Jede Kostenposition benötigt eine Kategorie.')
      if (Number.isNaN(item.amount)) validationErrors.push('Mindestens eine Kostenposition hat einen ungültigen Betrag.')
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)
    try {
      const { bill } = await createBillWithItems({
        type: 'annual_statement',
        year: parsedYear,
        periodStart: periodStart.value ? new Date(`${periodStart.value}T00:00:00.000Z`).toISOString() : undefined,
        periodEnd: periodEnd.value ? new Date(`${periodEnd.value}T00:00:00.000Z`).toISOString() : undefined,
        advancePayments: parsedAdvancePayments ?? 0,
        totalAmount: parsedTotalAmount ?? undefined,
        documentId: savedDocument.id,
        items: parsedItems,
      })
      showToast('Abrechnung gespeichert')
      navigate(billDetailPath(bill.id))
    } catch (error) {
      // Technical details only - never the document's OCR text/content.
      console.error('Saving the imported bill failed', error)
      setErrors(['Die Abrechnung konnte nicht gespeichert werden. Bitte versuche es erneut.'])
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Abrechnung importieren" subtitle="Dokument hochladen und automatisch auswerten lassen" />
      {step === 'select' && (
        <ImportSelectStep
          file={file}
          error={fileError}
          onSelect={handleSelect}
          onCancel={() => navigate(ROUTES.bills)}
          onContinue={handleStartProcessing}
        />
      )}
      {step === 'processing' && <ImportProcessingStep progress={progress} onCancel={handleCancelProcessing} />}
      {step === 'review' && savedDocument && (
        <ImportReviewStep
          filename={savedDocument.filename}
          rawText={rawText}
          year={year}
          periodStart={periodStart}
          periodEnd={periodEnd}
          totalAmount={totalAmount}
          advancePayments={advancePayments}
          items={items}
          categories={categories}
          categoriesLoading={categoriesLoading}
          saving={saving}
          errors={errors}
          onChangeYear={(value) => setYearField((current) => editedField(current, value))}
          onChangePeriodStart={(value) => setPeriodStartField((current) => editedField(current, value))}
          onChangePeriodEnd={(value) => setPeriodEndField((current) => editedField(current, value))}
          onChangeTotalAmount={(value) => setTotalAmountField((current) => editedField(current, value))}
          onChangeAdvancePayments={(value) => setAdvancePaymentsField((current) => editedField(current, value))}
          onChangeItem={updateItem}
          onAddItem={() => setItems((current) => [...current, emptyItemRow()])}
          onRemoveItem={removeItem}
          onCancel={handleCancelReview}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}

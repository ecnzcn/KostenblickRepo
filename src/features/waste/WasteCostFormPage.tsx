import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/feedback/useToast'
import { FormActions, FormError, MoneyField, SelectField, TextAreaField, TextField } from '../../components/form/fields'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ACCEPTED_DOCUMENT_INPUT_ACCEPT } from '../../constants/files'
import { ROUTES } from '../../constants/navigation'
import { WASTE_CATEGORY_OPTIONS } from '../../constants/waste'
import type { Document, WasteCategory } from '../../domain/models/entities'
import {
  deleteDocumentIfUnreferenced,
  getDocument,
  listDocumentsOverview,
  saveDocumentFile,
  validateDocumentFile,
} from '../../domain/usecases/documents'
import { createWasteCost, getWasteCost, updateWasteCost, validateWasteCostInput } from '../../domain/usecases/wasteCosts'
import { formatFileSize } from '../../utils/formatters'
import { parseGermanAmount } from '../../utils/money'

interface WasteCostFormPageProps {
  mode: 'create' | 'edit'
}

function currentYear(): number {
  return new Date().getUTCFullYear()
}

export function WasteCostFormPage({ mode }: WasteCostFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [yearText, setYearText] = useState(() => currentYear().toString())
  const [category, setCategory] = useState<WasteCategory | ''>('')
  const [amountText, setAmountText] = useState('')
  const [notes, setNotes] = useState('')

  const [currentDocument, setCurrentDocument] = useState<Document>()
  const [pendingFile, setPendingFile] = useState<File>()
  const [pendingExistingDocument, setPendingExistingDocument] = useState<Document>()
  const [documentRemoved, setDocumentRemoved] = useState(false)
  const [unlinkedDocuments, setUnlinkedDocuments] = useState<Document[]>([])
  const [showExistingPicker, setShowExistingPicker] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    listDocumentsOverview().then((overview) => {
      if (cancelled) return
      setUnlinkedDocuments(overview.filter((entry) => !entry.linkedEntity).map((entry) => entry.document))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    getWasteCost(id)
      .then((entry) => {
        if (cancelled) return
        if (!entry) {
          setLoadError(true)
          return
        }
        setYearText(entry.year.toString())
        setCategory(entry.category)
        setAmountText(entry.amount.toString().replace('.', ','))
        setNotes(entry.notes ?? '')
        if (entry.documentId) {
          getDocument(entry.documentId).then((doc) => {
            if (!cancelled) setCurrentDocument(doc)
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, id])

  function handleSelectNewFile(file: File | undefined) {
    if (!file) return
    const validationErrors = validateDocumentFile(file)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors([])
    setPendingFile(file)
    setPendingExistingDocument(undefined)
    setDocumentRemoved(false)
  }

  function handleSelectExistingDocument(documentId: string) {
    const document = unlinkedDocuments.find((doc) => doc.id === documentId)
    setPendingExistingDocument(document)
    setPendingFile(undefined)
    setDocumentRemoved(false)
    setShowExistingPicker(false)
  }

  function handleRemoveDocument() {
    setPendingFile(undefined)
    setPendingExistingDocument(undefined)
    setDocumentRemoved(true)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const amount = parseGermanAmount(amountText)
    const input = {
      year: Number(yearText),
      category: category as WasteCategory,
      amount: amount ?? Number.NaN,
      notes: notes || undefined,
    }

    const validationErrors = validateWasteCostInput(input)
    if (amount === null) validationErrors.push('Betrag konnte nicht gelesen werden.')
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors([])
    setSaving(true)

    let documentId: string | undefined
    let newlyUploadedDocumentId: string | undefined
    try {
      if (pendingFile) {
        const saved = await saveDocumentFile(pendingFile, 'waste')
        documentId = saved.id
        newlyUploadedDocumentId = saved.id
      } else if (pendingExistingDocument) {
        documentId = pendingExistingDocument.id
      } else if (!documentRemoved && currentDocument) {
        documentId = currentDocument.id
      }
    } catch (uploadError) {
      setSaving(false)
      setErrors([
        uploadError instanceof Error
          ? uploadError.message
          : 'Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.',
      ])
      return
    }

    try {
      if (mode === 'edit' && id) {
        await updateWasteCost(id, { ...input, documentId })
      } else {
        await createWasteCost({ ...input, documentId })
      }
      showToast('Müllkosten gespeichert')
      navigate(ROUTES.waste)
    } catch {
      // The entity write failed after a fresh upload already succeeded -
      // roll it back so it doesn't linger as an orphaned document.
      if (newlyUploadedDocumentId) await deleteDocumentIfUnreferenced(newlyUploadedDocumentId).catch(() => undefined)
      setErrors(['Die Daten konnten nicht gespeichert werden. Bitte versuche es erneut.'])
    } finally {
      setSaving(false)
    }
  }

  if (loadingExisting) return <LoadingState />
  if (loadError) return <p className="text-sm text-red-700">Müllkosten-Eintrag wurde nicht gefunden.</p>

  const attachedDocument = pendingFile
    ? { filename: pendingFile.name, sizeLabel: formatFileSize(pendingFile.size), pending: true }
    : pendingExistingDocument
      ? { filename: pendingExistingDocument.filename, sizeLabel: formatFileSize(pendingExistingDocument.size), pending: false }
      : !documentRemoved && currentDocument
        ? { filename: currentDocument.filename, sizeLabel: formatFileSize(currentDocument.size), pending: false }
        : undefined

  return (
    <>
      <PageHeader title={mode === 'edit' ? 'Müllkosten bearbeiten' : 'Müllkosten erfassen'} />
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormError errors={errors} />
        <TextField
          id="waste-year"
          label="Jahr"
          type="number"
          value={yearText}
          onChange={(event) => setYearText(event.target.value)}
          required
        />
        <SelectField
          id="waste-category"
          label="Kategorie"
          placeholder="Kategorie wählen"
          options={WASTE_CATEGORY_OPTIONS}
          value={category}
          onChange={(event) => setCategory(event.target.value as WasteCategory)}
          required
        />
        <MoneyField id="waste-amount" label="Betrag" value={amountText} onChange={setAmountText} />
        <TextAreaField
          id="waste-notes"
          label="Notiz"
          optional
          placeholder="z. B. Jahresgebühr laut Gebührenbescheid"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-neutral-700">
            Dokument <span className="text-neutral-400">(optional)</span>
          </p>

          {attachedDocument ? (
            <div className="flex items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{attachedDocument.filename}</p>
                <p className="text-xs text-neutral-500">
                  {attachedDocument.sizeLabel}
                  {attachedDocument.pending ? ' · wird beim Speichern hochgeladen' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveDocument}
                className="ml-3 min-h-11 shrink-0 text-sm font-medium text-red-600"
              >
                Entfernen
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700">
                Neues Dokument hochladen
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept={ACCEPTED_DOCUMENT_INPUT_ACCEPT}
                  className="sr-only"
                  onChange={(event) => handleSelectNewFile(event.target.files?.[0])}
                />
              </label>
              {unlinkedDocuments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowExistingPicker((current) => !current)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
                >
                  Vorhandenes Dokument auswählen
                </button>
              ) : null}
            </div>
          )}

          {showExistingPicker && !attachedDocument ? (
            <SelectField
              id="waste-existing-document"
              label="Vorhandenes Dokument"
              placeholder="Dokument wählen"
              options={unlinkedDocuments.map((doc) => ({ value: doc.id, label: doc.filename }))}
              value=""
              onChange={(event) => handleSelectExistingDocument(event.target.value)}
            />
          ) : null}
        </div>

        <FormActions onCancel={() => navigate(ROUTES.waste)} saving={saving} />
      </form>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { DocumentViewer } from '../../components/documents/DocumentViewer'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { ACCEPTED_DOCUMENT_INPUT_ACCEPT } from '../../constants/files'
import { billDetailPath, contractDetailPath, ROUTES, wasteDetailPath } from '../../constants/navigation'
import { DOCUMENT_TYPE_LABELS, OCR_STATUS_LABELS } from '../../constants/documents'
import type { Document } from '../../domain/models/entities'
import {
  deleteDocumentAndClearReferences,
  getDocument,
  getDocumentBlob,
  getLinkedEntity,
  replaceDocumentFile,
  validateDocumentFile,
  type DocumentLinkedEntity,
} from '../../domain/usecases/documents'
import { formatDate, formatFileSize } from '../../utils/formatters'

function linkedEntityPath(linkedEntity: DocumentLinkedEntity): string | undefined {
  if (linkedEntity.entityType === 'bill') return billDetailPath(linkedEntity.entityId)
  if (linkedEntity.entityType === 'contract') return contractDetailPath(linkedEntity.entityId)
  if (linkedEntity.entityType === 'waste') return wasteDetailPath(linkedEntity.entityId)
  return undefined
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
    </div>
  )
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const [document, setDocument] = useState<Document>()
  const [linkedEntity, setLinkedEntity] = useState<DocumentLinkedEntity>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [blob, setBlob] = useState<Blob>()
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)

  const [replaceBusy, setReplaceBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getDocument(id), getLinkedEntity(id)])
      .then(([foundDocument, foundLinkedEntity]) => {
        if (cancelled) return
        if (!foundDocument || foundDocument.deletedAt) {
          setError(true)
          return
        }
        setDocument(foundDocument)
        setLinkedEntity(foundLinkedEntity)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function loadBlob(current: Document): Promise<Blob | undefined> {
    if (blob) return blob
    try {
      const loaded = await getDocumentBlob(current)
      if (!loaded) {
        showToast('Die Datei konnte nicht geladen werden.', 'error')
        return undefined
      }
      setBlob(loaded)
      return loaded
    } catch {
      showToast('Die Datei konnte nicht geladen werden.', 'error')
      return undefined
    }
  }

  async function handleTogglePreview() {
    if (previewVisible) {
      setPreviewVisible(false)
      return
    }
    if (!document) return
    setPreviewBusy(true)
    const loaded = await loadBlob(document)
    setPreviewBusy(false)
    if (loaded) setPreviewVisible(true)
  }

  async function handleDownload() {
    if (!document) return
    const loaded = await loadBlob(document)
    if (!loaded) return
    const url = URL.createObjectURL(loaded)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleReplaceFile(file: File | undefined) {
    if (!file || !document) return
    const validationErrors = validateDocumentFile(file)
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(' '), 'error')
      return
    }
    setReplaceBusy(true)
    try {
      const updated = await replaceDocumentFile(document.id, file)
      setDocument(updated)
      setBlob(undefined)
      setPreviewVisible(false)
      showToast('Datei ersetzt')
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'Datei konnte nicht ersetzt werden.', 'error')
    } finally {
      setReplaceBusy(false)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  async function handleDelete() {
    if (!document) return
    const confirmMessage = linkedEntity
      ? `Dokument "${document.filename}" wirklich löschen? Es ist mit "${linkedEntity.label}" verknüpft - die Verknüpfung wird dabei entfernt.`
      : `Dokument "${document.filename}" wirklich löschen?`
    if (!window.confirm(confirmMessage)) return

    setDeleteBusy(true)
    try {
      await deleteDocumentAndClearReferences(document.id)
      showToast('Dokument gelöscht')
      navigate(ROUTES.documents)
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
      setDeleteBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error || !document) return <ErrorState message="Dieses Dokument wurde nicht gefunden." />

  const targetPath = linkedEntity ? linkedEntityPath(linkedEntity) : undefined

  return (
    <>
      <PageHeader title={document.filename} subtitle={DOCUMENT_TYPE_LABELS[document.type]} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <DetailRow label="Dateiname" value={document.filename} />
          <DetailRow label="Dokumenttyp" value={DOCUMENT_TYPE_LABELS[document.type]} />
          <DetailRow label="Dateigröße" value={formatFileSize(document.size)} />
          <DetailRow label="Datum" value={formatDate(document.createdAt)} />
          <DetailRow label="MIME-Type" value={document.mimeType || 'unbekannt'} />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-xs text-neutral-500">OCR-Status</p>
          <p className="text-sm font-medium text-neutral-900">{OCR_STATUS_LABELS[document.ocrStatus]}</p>
          {document.ocrText ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent">Erkannter Text anzeigen</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
                {document.ocrText}
              </pre>
            </details>
          ) : null}
        </div>

        {linkedEntity ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Verknüpft mit</p>
            {targetPath ? (
              <Link to={targetPath} className="text-sm font-medium text-accent">
                {linkedEntity.label}
              </Link>
            ) : (
              <p className="text-sm font-medium text-neutral-900">{linkedEntity.label}</p>
            )}
          </div>
        ) : null}

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-neutral-900">Vorschau</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleTogglePreview}
              disabled={previewBusy}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 disabled:opacity-60"
            >
              {previewVisible ? 'Vorschau schließen' : 'Vorschau anzeigen'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
            >
              Herunterladen
            </button>
          </div>
          {previewVisible && blob ? (
            <div className="mt-3">
              <DocumentViewer blob={blob} mimeType={document.mimeType} filename={document.filename} />
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-neutral-900">Datei verwalten</p>
          <div className="flex flex-wrap gap-2">
            <label className="min-h-11 cursor-pointer rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700">
              {replaceBusy ? 'Wird ersetzt …' : 'Datei ersetzen'}
              <input
                ref={replaceInputRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_INPUT_ACCEPT}
                className="sr-only"
                disabled={replaceBusy}
                onChange={(event) => handleReplaceFile(event.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteBusy}
              className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600 disabled:opacity-60"
            >
              Dokument löschen
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

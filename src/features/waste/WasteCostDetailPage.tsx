import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { DocumentViewer } from '../../components/documents/DocumentViewer'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { WASTE_CATEGORY_LABELS } from '../../constants/waste'
import { documentDetailPath, wasteEditPath, ROUTES } from '../../constants/navigation'
import type { Document, WasteCost } from '../../domain/models/entities'
import { getDocument, getDocumentBlob } from '../../domain/usecases/documents'
import { deleteWasteCost, getWasteCost } from '../../domain/usecases/wasteCosts'
import { formatCurrency } from '../../utils/formatters'

export function WasteCostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [wasteCost, setWasteCost] = useState<WasteCost>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [wasteCostDocument, setWasteCostDocument] = useState<Document>()
  const [documentBlob, setDocumentBlob] = useState<Blob>()
  const [documentVisible, setDocumentVisible] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getWasteCost(id)
      .then((found) => {
        if (cancelled) return
        if (!found || found.deletedAt) {
          setError(true)
          return
        }
        setWasteCost(found)
        if (found.documentId) {
          getDocument(found.documentId).then((doc) => {
            if (!cancelled) setWasteCostDocument(doc)
          })
        }
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

  async function handleToggleDocument() {
    if (documentVisible) {
      setDocumentVisible(false)
      return
    }
    if (!wasteCostDocument) return
    if (!documentBlob) {
      try {
        const blob = await getDocumentBlob(wasteCostDocument)
        if (!blob) {
          showToast('Das Dokument konnte nicht geladen werden.', 'error')
          return
        }
        setDocumentBlob(blob)
      } catch {
        showToast('Das Dokument konnte nicht geladen werden.', 'error')
        return
      }
    }
    setDocumentVisible(true)
  }

  async function handleDelete() {
    if (!id || !window.confirm('Müllkosten löschen? Dieser Eintrag wird dauerhaft gelöscht.')) return
    try {
      await deleteWasteCost(id)
      showToast('Müllkosten gelöscht')
      navigate(ROUTES.waste)
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  if (loading) return <LoadingState />
  if (error || !wasteCost) return <ErrorState message="Dieser Müllkosten-Eintrag wurde nicht gefunden." />

  const label = WASTE_CATEGORY_LABELS[wasteCost.category]

  return (
    <>
      <PageHeader title={`Müllkosten ${wasteCost.year}`} subtitle={label} />
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Betrag</p>
          <p className="mt-1 text-3xl font-semibold text-neutral-900">{formatCurrency(wasteCost.amount)}</p>
        </div>

        {wasteCost.notes ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Notiz</p>
            <p className="mt-1 text-sm text-neutral-700">{wasteCost.notes}</p>
          </div>
        ) : null}

        {wasteCostDocument ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-neutral-900">Dokument</p>
            <p className="mb-3 text-sm text-neutral-600">{wasteCostDocument.filename}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleDocument}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
              >
                {documentVisible ? 'Dokument schließen' : 'Dokument öffnen'}
              </button>
              <Link
                to={documentDetailPath(wasteCostDocument.id)}
                className="inline-flex min-h-11 items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
              >
                In Dokumentenverwaltung öffnen
              </Link>
            </div>
            {documentVisible && documentBlob ? (
              <div className="mt-3">
                <DocumentViewer
                  blob={documentBlob}
                  mimeType={wasteCostDocument.mimeType}
                  filename={wasteCostDocument.filename}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <ItemActions
          itemLabel={`Müllkosten ${wasteCost.year}`}
          onEdit={() => navigate(wasteEditPath(wasteCost.id))}
          onDelete={handleDelete}
        />
      </div>
    </>
  )
}

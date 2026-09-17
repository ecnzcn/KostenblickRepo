import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { DocumentViewer } from '../../components/documents/DocumentViewer'
import { useToast } from '../../components/feedback/useToast'
import { billEditPath, ROUTES } from '../../constants/navigation'
import type { Bill, BillItem, Category, Document } from '../../domain/models/entities'
import { BILL_TYPE_LABELS, deleteBillWithItems, getBill, listBillItems, removeBillDocument } from '../../domain/usecases/bills'
import { getDocument, getDocumentBlob } from '../../domain/usecases/documents'
import { categoryRepository } from '../../domain/repositories/categories'
import { formatCurrency, formatDate } from '../../utils/formatters'

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [bill, setBill] = useState<Bill | undefined>()
  const [items, setItems] = useState<BillItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [billDocument, setBillDocument] = useState<Document>()
  const [documentBlob, setDocumentBlob] = useState<Blob>()
  const [documentVisible, setDocumentVisible] = useState(false)
  const [documentBusy, setDocumentBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getBill(id), listBillItems(id), categoryRepository.getAll()])
      .then(([foundBill, billItems, categoryList]) => {
        if (cancelled) return
        if (!foundBill || foundBill.deletedAt) {
          setError(true)
          return
        }
        setBill(foundBill)
        setItems(billItems)
        setCategories(categoryList)
        if (foundBill.documentId) {
          getDocument(foundBill.documentId).then((doc) => {
            if (!cancelled) setBillDocument(doc)
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
    if (!billDocument) return
    if (!documentBlob) {
      try {
        const blob = await getDocumentBlob(billDocument)
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

  async function handleDeleteDocument() {
    if (!bill || !window.confirm('Das Originaldokument wirklich löschen? Die Abrechnung bleibt erhalten.')) return
    setDocumentBusy(true)
    try {
      const updatedBill = await removeBillDocument(bill)
      setBill(updatedBill)
      setBillDocument(undefined)
      setDocumentBlob(undefined)
      setDocumentVisible(false)
      showToast('Dokument gelöscht')
    } catch {
      showToast('Dokument konnte nicht gelöscht werden. Bitte versuche es erneut.', 'error')
    } finally {
      setDocumentBusy(false)
    }
  }

  async function handleDelete() {
    if (!id || !window.confirm('Diese Abrechnung wirklich löschen?')) return
    try {
      await deleteBillWithItems(id)
      showToast('Abrechnung gelöscht')
      navigate(ROUTES.bills)
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  if (loading) return <LoadingState />
  if (error || !bill) return <ErrorState message="Diese Abrechnung wurde nicht gefunden." />

  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  return (
    <>
      <PageHeader title={`${BILL_TYPE_LABELS[bill.type]} ${bill.year}`} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <div>
            <p className="text-xs text-neutral-500">Gesamtkosten</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(bill.totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Vorauszahlungen</p>
            <p className="text-lg font-semibold text-neutral-900">{formatCurrency(bill.advancePayments)}</p>
          </div>
          {bill.balanceType !== 'none' && (
            <div>
              <p className="text-xs text-neutral-500">
                {bill.balanceType === 'payment_due' ? 'Nachzahlung' : 'Guthaben'}
              </p>
              <p className="text-lg font-semibold text-neutral-900">{formatCurrency(bill.balance)}</p>
            </div>
          )}
          {bill.periodStart && bill.periodEnd ? (
            <div>
              <p className="text-xs text-neutral-500">Zeitraum</p>
              <p className="text-sm font-medium text-neutral-900">
                {formatDate(bill.periodStart)} – {formatDate(bill.periodEnd)}
              </p>
            </div>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-neutral-900">Kostenpositionen</p>
            <ul className="flex flex-col divide-y divide-neutral-100">
              {items.map((item) => {
                const category = item.categoryId ? categoriesById.get(item.categoryId) : undefined
                return (
                  <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-neutral-700">
                      {category ? `${category.icon} ${category.name}` : item.description}
                    </span>
                    <span className="font-medium text-neutral-900">{formatCurrency(item.amount)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {bill.documentId && billDocument ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-neutral-900">Originaldokument</p>
            <p className="mb-3 text-sm text-neutral-600">{billDocument.filename}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleDocument}
                className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
              >
                {documentVisible ? 'Dokument schließen' : 'Dokument öffnen'}
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={documentBusy}
                className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-600 disabled:opacity-60"
              >
                Dokument löschen
              </button>
            </div>
            {documentVisible && documentBlob ? (
              <div className="mt-3">
                <DocumentViewer blob={documentBlob} mimeType={billDocument.mimeType} filename={billDocument.filename} />
              </div>
            ) : null}
          </div>
        ) : null}

        <ItemActions
          itemLabel={`Abrechnung ${bill.year}`}
          onEdit={() => navigate(billEditPath(bill.id))}
          onDelete={handleDelete}
        />
      </div>
    </>
  )
}

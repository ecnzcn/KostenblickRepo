import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { DocumentViewer } from '../../components/documents/DocumentViewer'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { ACCEPTED_DOCUMENT_INPUT_ACCEPT } from '../../constants/files'
import { contractEditPath, documentDetailPath, ROUTES } from '../../constants/navigation'
import type { Contract, Document, Reminder } from '../../domain/models/entities'
import {
  deleteContract,
  getContract,
  removeContractDocument,
  setContractDocument as setContractDocumentUseCase,
} from '../../domain/usecases/contracts'
import { getDocument, getDocumentBlob, saveDocumentFile, validateDocumentFile } from '../../domain/usecases/documents'
import { listRemindersForContract } from '../../domain/usecases/reminders/reminderQueries'
import { useCategories } from '../../hooks/useCategories'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { ContractStatusBadge } from './components/ContractStatusBadge'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="break-words text-sm font-medium text-neutral-900">{value}</p>
    </div>
  )
}

const CANCELLATION_UNIT_LABEL: Record<string, string> = {
  days: 'Tage',
  weeks: 'Wochen',
  months: 'Monate',
  years: 'Jahre',
}

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [contract, setContract] = useState<Contract | undefined>()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const { categories } = useCategories()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [contractDocument, setContractDocument] = useState<Document>()
  const [documentBlob, setDocumentBlob] = useState<Blob>()
  const [documentVisible, setDocumentVisible] = useState(false)
  const [documentBusy, setDocumentBusy] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getContract(id), listRemindersForContract(id)])
      .then(([found, foundReminders]) => {
        if (cancelled) return
        if (!found || found.deletedAt) {
          setError(true)
          return
        }
        setContract(found)
        setReminders(foundReminders)
        if (found.documentId) {
          getDocument(found.documentId).then((doc) => {
            if (!cancelled) setContractDocument(doc)
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

  async function handleDelete() {
    if (!id || !window.confirm('Diesen Vertrag wirklich löschen?')) return
    try {
      await deleteContract(id)
      showToast('Vertrag gelöscht')
      navigate(ROUTES.contracts)
    } catch {
      showToast('Löschen fehlgeschlagen. Bitte versuche es erneut.', 'error')
    }
  }

  async function handleUploadDocument(file: File | undefined) {
    if (!file || !contract) return
    const validationErrors = validateDocumentFile(file)
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(' '), 'error')
      return
    }
    setDocumentBusy(true)
    try {
      const saved = await saveDocumentFile(file, 'contract')
      const updated = await setContractDocumentUseCase(contract.id, saved.id)
      setContract(updated)
      setContractDocument(saved)
      showToast('Vertragsdokument gespeichert')
    } catch {
      showToast('Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.', 'error')
    } finally {
      setDocumentBusy(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  async function handleToggleDocument() {
    if (documentVisible) {
      setDocumentVisible(false)
      return
    }
    if (!contractDocument) return
    if (!documentBlob) {
      try {
        const blob = await getDocumentBlob(contractDocument)
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
    if (!contract || !window.confirm('Das Vertragsdokument wirklich löschen? Der Vertrag bleibt erhalten.')) return
    setDocumentBusy(true)
    try {
      const updated = await removeContractDocument(contract)
      setContract(updated)
      setContractDocument(undefined)
      setDocumentBlob(undefined)
      setDocumentVisible(false)
      showToast('Dokument gelöscht')
    } catch {
      showToast('Dokument konnte nicht gelöscht werden. Bitte versuche es erneut.', 'error')
    } finally {
      setDocumentBusy(false)
    }
  }

  if (loading) return <LoadingState />
  if (error || !contract) return <ErrorState message="Dieser Vertrag wurde nicht gefunden." />

  const category = categories.find((c) => c.id === contract.categoryId)

  return (
    <>
      <PageHeader title={contract.provider} subtitle={contract.tariff} />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-4">
          <p className="text-sm text-neutral-500">Status</p>
          <ContractStatusBadge contract={contract} />
        </div>
        {category ? (
          <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-4">
            <p className="text-sm text-neutral-500">Kategorie</p>
            <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              <span aria-hidden="true">{category.icon}</span>
              {category.name}
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="Monatliche Kosten" value={`${formatCurrency(contract.monthlyCost)}/Monat`} />
            {contract.yearlyCost !== undefined ? (
              <DetailRow label="Jährliche Kosten" value={`${formatCurrency(contract.yearlyCost)}/Jahr`} />
            ) : null}
            <DetailRow label="Beginn" value={formatDate(contract.startDate)} />
            {contract.endDate ? <DetailRow label="Ende" value={formatDate(contract.endDate)} /> : null}
            {contract.cancellationPeriodValue !== undefined && contract.cancellationPeriodUnit ? (
              <DetailRow
                label="Kündigungsfrist"
                value={`${contract.cancellationPeriodValue} ${CANCELLATION_UNIT_LABEL[contract.cancellationPeriodUnit]}`}
              />
            ) : null}
            {contract.calculatedCancellationDate ? (
              <DetailRow label="Kündigung bis" value={formatDate(contract.calculatedCancellationDate)} />
            ) : null}
          </div>
          <p className="mt-4 text-xs text-neutral-400">
            Vertraglich vereinbart - nicht in der Kostenübersicht enthalten.
          </p>
        </div>
        {reminders.length > 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Erinnerungen</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {reminders.map((reminder) => (
                <li key={reminder.id} className="flex items-center gap-2 text-sm text-neutral-700">
                  <span aria-hidden="true">{reminder.status === 'dismissed' ? '✓' : '○'}</span>
                  <span className="sr-only">{reminder.status === 'dismissed' ? 'Erledigt: ' : 'Offen: '}</span>
                  {formatDate(reminder.reminderDate)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {contract.notes ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Notiz</p>
            <p className="mt-1 text-sm text-neutral-700">{contract.notes}</p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-1 text-sm font-semibold text-neutral-900">Vertragsdokument</p>
          {contractDocument ? (
            <>
              <p className="mb-3 break-words text-sm text-neutral-600">{contractDocument.filename}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleToggleDocument}
                  className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
                >
                  {documentVisible ? 'Dokument schließen' : 'Dokument öffnen'}
                </button>
                <Link
                  to={documentDetailPath(contractDocument.id)}
                  className="inline-flex min-h-11 items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
                >
                  In Dokumentenverwaltung öffnen
                </Link>
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
                  <DocumentViewer blob={documentBlob} mimeType={contractDocument.mimeType} filename={contractDocument.filename} />
                </div>
              ) : null}
            </>
          ) : (
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700">
              {documentBusy ? 'Wird gespeichert …' : 'Vertragsdokument hochladen'}
              <input
                ref={uploadInputRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_INPUT_ACCEPT}
                className="sr-only"
                disabled={documentBusy}
                onChange={(event) => handleUploadDocument(event.target.files?.[0])}
              />
            </label>
          )}
        </div>

        <ItemActions
          itemLabel={contract.provider}
          onEdit={() => navigate(contractEditPath(contract.id))}
          onDelete={handleDelete}
        />
      </div>
    </>
  )
}

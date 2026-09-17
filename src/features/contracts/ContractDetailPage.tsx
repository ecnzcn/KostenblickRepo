import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { contractEditPath, ROUTES } from '../../constants/navigation'
import type { Contract, Reminder } from '../../domain/models/entities'
import { deleteContract, getContract } from '../../domain/usecases/contracts'
import { listRemindersForContract } from '../../domain/usecases/reminders/reminderQueries'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { ContractStatusBadge } from './components/ContractStatusBadge'

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-sm font-medium text-neutral-900">{value}</p>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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

  if (loading) return <LoadingState />
  if (error || !contract) return <ErrorState message="Dieser Vertrag wurde nicht gefunden." />

  return (
    <>
      <PageHeader title={contract.provider} subtitle={contract.tariff} />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-5 py-4">
          <p className="text-sm text-neutral-500">Status</p>
          <ContractStatusBadge contract={contract} />
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
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
        <ItemActions
          itemLabel={contract.provider}
          onEdit={() => navigate(contractEditPath(contract.id))}
          onDelete={handleDelete}
        />
      </div>
    </>
  )
}

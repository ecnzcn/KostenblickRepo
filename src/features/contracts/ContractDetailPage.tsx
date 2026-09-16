import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { ItemActions } from '../../components/ItemActions'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { contractEditPath, ROUTES } from '../../constants/navigation'
import type { Contract } from '../../domain/models/entities'
import { deleteContract, getContract } from '../../domain/usecases/contracts'
import { formatCurrency, formatDate } from '../../utils/formatters'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getContract(id)
      .then((found) => {
        if (cancelled) return
        if (!found || found.deletedAt) {
          setError(true)
          return
        }
        setContract(found)
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

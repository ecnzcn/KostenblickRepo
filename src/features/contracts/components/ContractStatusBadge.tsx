import { CONTRACT_STATUS_LABELS, getContractStatus, type ContractStatus } from '../../../domain/usecases/reminders/contractStatus'
import type { Contract } from '../../../domain/models/entities'

const STATUS_CLASSES: Record<ContractStatus, string> = {
  active: 'bg-neutral-100 text-neutral-600',
  upcoming: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
  expired: 'bg-neutral-100 text-neutral-400',
}

interface ContractStatusBadgeProps {
  contract: Contract
}

export function ContractStatusBadge({ contract }: ContractStatusBadgeProps) {
  const status = getContractStatus(contract)
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  )
}

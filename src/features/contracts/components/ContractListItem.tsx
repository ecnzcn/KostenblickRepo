import { ItemActions } from '../../../components/ItemActions'
import type { Category, Contract } from '../../../domain/models/entities'
import { daysUntil } from '../../../utils/date'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import { ContractStatusBadge } from './ContractStatusBadge'

interface ContractListItemProps {
  contract: Contract
  category: Category | undefined
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ContractListItem({ contract, category, onOpen, onEdit, onDelete }: ContractListItemProps) {
  const remaining = contract.calculatedCancellationDate ? daysUntil(contract.calculatedCancellationDate) : undefined

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">{contract.provider}</p>
            {contract.tariff ? <p className="text-xs text-neutral-500">{contract.tariff}</p> : null}
            {category ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                <span aria-hidden="true">{category.icon}</span>
                {category.name}
              </p>
            ) : null}
          </div>
          <ContractStatusBadge contract={contract} />
        </div>
        <p className="mt-1 text-sm text-neutral-700">{formatCurrency(contract.monthlyCost)}/Monat</p>
        {contract.calculatedCancellationDate ? (
          <div className="mt-2 text-xs text-neutral-500">
            <p>Kündigung bis: {formatDate(contract.calculatedCancellationDate)}</p>
            {remaining !== undefined && remaining >= 0 ? <p>Noch {remaining} Tage</p> : null}
          </div>
        ) : null}
      </button>
      <div className="mt-3">
        <ItemActions itemLabel={contract.provider} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  )
}

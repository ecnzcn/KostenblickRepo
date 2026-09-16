import { ItemActions } from '../../../components/ItemActions'
import type { Bill } from '../../../domain/models/entities'
import { BILL_TYPE_LABELS } from '../../../domain/usecases/bills'
import { formatCurrency } from '../../../utils/formatters'

interface BillListItemProps {
  bill: Bill
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BillListItem({ bill, onOpen, onEdit, onDelete }: BillListItemProps) {
  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <p className="text-sm font-medium text-neutral-900">{bill.year}</p>
        <p className="text-xs text-neutral-500">{BILL_TYPE_LABELS[bill.type]}</p>
        <p className="mt-1 text-base font-semibold text-neutral-900">{formatCurrency(bill.totalAmount)}</p>
        {bill.balanceType !== 'none' && (
          <p className="text-xs text-neutral-500">
            {bill.balanceType === 'payment_due' ? 'Nachzahlung' : 'Guthaben'}: {formatCurrency(bill.balance)}
          </p>
        )}
      </button>
      <div className="mt-3">
        <ItemActions itemLabel={`Abrechnung ${bill.year}`} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  )
}

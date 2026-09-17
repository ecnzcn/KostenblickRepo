import { ItemActions } from '../../../components/ItemActions'
import { WASTE_CATEGORY_LABELS } from '../../../constants/waste'
import type { WasteCost } from '../../../domain/models/entities'
import { formatCurrency } from '../../../utils/formatters'

interface WasteCostListItemProps {
  entry: WasteCost
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export function WasteCostListItem({ entry, onOpen, onEdit, onDelete }: WasteCostListItemProps) {
  const label = WASTE_CATEGORY_LABELS[entry.category]

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <button type="button" onClick={onOpen} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{label}</p>
          {entry.notes ? <p className="truncate text-xs text-neutral-500">{entry.notes}</p> : null}
          {entry.documentId ? <p className="mt-1 text-xs text-neutral-500">📄 Dokument vorhanden</p> : null}
        </div>
        <p className="shrink-0 text-base font-semibold text-neutral-900">{formatCurrency(entry.amount)}</p>
      </button>
      <div className="mt-3">
        <ItemActions itemLabel={label} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  )
}

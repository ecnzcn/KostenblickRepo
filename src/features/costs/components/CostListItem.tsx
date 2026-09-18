import type { Category, CostEntry } from '../../../domain/models/entities'
import { ItemActions } from '../../../components/ItemActions'
import { formatCurrency, formatDate } from '../../../utils/formatters'

interface CostListItemProps {
  entry: CostEntry
  category: Category | undefined
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}

export function CostListItem({ entry, category, onOpen, onEdit, onDelete }: CostListItemProps) {
  const label = category ? `${category.icon} ${category.name}` : 'Sonstiges'

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{label}</p>
          <p className="text-xs text-neutral-500">{formatDate(entry.date)}</p>
          {entry.notes ? <p className="truncate text-xs text-neutral-500">{entry.notes}</p> : null}
        </div>
        <p className="shrink-0 text-base font-semibold text-neutral-900">{formatCurrency(entry.amount)}</p>
      </button>
      <div className="mt-3">
        <ItemActions itemLabel={label} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </li>
  )
}

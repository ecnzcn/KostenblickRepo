import { Link } from 'react-router-dom'
import { contractDetailPath } from '../../../constants/navigation'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import type { ReminderDisplayStatus, ReminderListEntry } from '../reminders.types'

interface ReminderListItemProps {
  entry: ReminderListEntry
  onDismiss: (id: string) => void
}

const STATUS_LABELS: Record<ReminderDisplayStatus, string> = {
  overdue: 'Überfällig',
  due: 'Heute fällig',
  upcoming: 'Bevorstehend',
  completed: 'Erledigt',
}

const STATUS_CLASSES: Record<ReminderDisplayStatus, string> = {
  overdue: 'bg-red-50 text-red-700',
  due: 'bg-amber-50 text-amber-700',
  upcoming: 'bg-neutral-100 text-neutral-600',
  completed: 'bg-neutral-100 text-neutral-400',
}

export function ReminderListItem({ entry, onDismiss }: ReminderListItemProps) {
  const { reminder, contract, categoryName, categoryIcon, displayStatus } = entry

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
            <span aria-hidden="true">{categoryIcon}</span>
            {contract.provider}
          </p>
          {contract.tariff ? <p className="text-xs text-neutral-500">{contract.tariff}</p> : null}
          <p className="mt-1 text-xs text-neutral-500">{categoryName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[displayStatus]}`}>
          {STATUS_LABELS[displayStatus]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500">
        <p>Erinnerung: {formatDate(reminder.reminderDate)}</p>
        {contract.calculatedCancellationDate ? <p>Kündigung bis: {formatDate(contract.calculatedCancellationDate)}</p> : null}
        <p>{formatCurrency(contract.monthlyCost)}/Monat</p>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDismiss(reminder.id)}
          className="min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
        >
          Als erledigt markieren
        </button>
        <Link
          to={contractDetailPath(contract.id)}
          className="min-h-11 flex-1 rounded-xl bg-accent px-3 text-center text-sm font-medium leading-[2.75rem] text-white"
        >
          Vertrag öffnen
        </Link>
      </div>
    </li>
  )
}

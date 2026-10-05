import { Link } from 'react-router-dom'
import { categoryGroupColor, UNCATEGORIZED_GROUP_ID } from '../../../constants/categoryGroups'
import { transactionDetailPath } from '../../../constants/navigation'
import type { RecentTransaction } from '../../../domain/usecases/finance/monthlyOverview'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import { flowLabel } from '../../transactions/transactionLabels'

function amountClass(entry: RecentTransaction): string {
  const { flowType, amount } = entry.transaction
  if (flowType === 'transfer' || flowType === 'saving') return 'text-neutral-600'
  return amount < 0 ? 'text-red-700' : 'text-emerald-700'
}

export function RecentTransactions({ entries }: { entries: RecentTransaction[] }) {
  if (entries.length === 0) return <p className="text-sm text-neutral-500">Keine Buchungen in diesem Monat.</p>
  return (
    <ul className="divide-y divide-neutral-100">
      {entries.map((entry) => {
        const { transaction, category } = entry
        const groupId = category ? (category.group ?? category.id) : UNCATEGORIZED_GROUP_ID
        return (
          <li key={transaction.id}>
            <Link to={transactionDetailPath(transaction.id)} className="flex min-h-11 items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: `${categoryGroupColor(groupId)}1f` }}
              >
                {category?.icon ?? '•'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {transaction.counterpartyName || transaction.bookingText || 'Buchung'}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {category?.name ?? flowLabel(transaction)} · {formatDate(transaction.bookingDate)}
                </span>
              </span>
              <span className={`shrink-0 text-sm font-medium tabular-nums ${amountClass(entry)}`}>{formatCurrency(transaction.amount)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

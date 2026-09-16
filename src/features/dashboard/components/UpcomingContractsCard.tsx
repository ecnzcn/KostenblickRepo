import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { formatDate } from '../../../utils/formatters'
import type { ContractDeadline } from '../dashboard.types'

interface UpcomingContractsCardProps {
  deadlines: ContractDeadline[]
}

export function UpcomingContractsCard({ deadlines }: UpcomingContractsCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Vertragsfristen</h2>
      {deadlines.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Keine anstehenden Vertragsfristen</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-neutral-100">
          {deadlines.map((deadline) => (
            <li key={deadline.contractId} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-900">{deadline.categoryName}</p>
              <p className="text-sm text-neutral-500">
                Kündigung bis {formatDate(deadline.cancellationDate)}
              </p>
              <p className="text-sm text-neutral-500">Noch {deadline.daysRemaining} Tage</p>
            </li>
          ))}
        </ul>
      )}
      <Link
        to={ROUTES.contracts}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent"
      >
        Alle Verträge
      </Link>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import type { BillSummary } from '../dashboard.types'

interface LatestBillCardProps {
  bill?: BillSummary
}

export function LatestBillCard({ bill }: LatestBillCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Letzte Abrechnung</h2>
      {!bill ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine Nebenkostenabrechnung importiert.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-neutral-900">{bill.title}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-neutral-500">Gesamtkosten</p>
              <p className="text-lg font-semibold text-neutral-900">{formatCurrency(bill.totalAmount)}</p>
            </div>
            {bill.balanceType !== 'none' && (
              <div>
                <p className="text-xs text-neutral-500">
                  {bill.balanceType === 'payment_due' ? 'Nachzahlung' : 'Guthaben'}
                </p>
                <p className="text-lg font-semibold text-neutral-900">{formatCurrency(bill.balance)}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-neutral-500">Importiert am {formatDate(bill.importedAt)}</p>
        </div>
      )}
      <Link
        to={ROUTES.bills}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent"
      >
        {bill ? 'Abrechnung öffnen' : '+ Abrechnung hinzufügen'}
      </Link>
    </section>
  )
}

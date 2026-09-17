import { formatCurrency } from '../../../utils/formatters'
import type { StatisticsSummary } from '../statistics.types'

interface BillDiscrepancyNoticeProps {
  summary: StatisticsSummary
}

/** Surfaces a gap between Bill.totalAmount and the sum of its BillItems
 * transparently instead of silently reconciling it (CLAUDE.md, "No double
 * counting"). Renders nothing when there is no discrepancy. */
export function BillDiscrepancyNotice({ summary }: BillDiscrepancyNoticeProps) {
  if (summary.unassignedDifference === 0) return null

  const isPositive = summary.unassignedDifference > 0

  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
      <p>
        Gesamtkosten: <strong>{formatCurrency(summary.totalAmount)}</strong>, Kostenpositionen:{' '}
        <strong>{formatCurrency(summary.itemizedAmount)}</strong>
        {isPositive ? (
          <>
            , nicht zugeordnete Differenz: <strong>{formatCurrency(summary.unassignedDifference)}</strong>
          </>
        ) : (
          <>
            , Kostenpositionen übersteigen die Gesamtsumme um{' '}
            <strong>{formatCurrency(Math.abs(summary.unassignedDifference))}</strong>
          </>
        )}
        .
      </p>
    </div>
  )
}

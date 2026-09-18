import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import type { CostAggregationWarning } from '../dashboard.types'

interface DashboardAggregationWarningProps {
  warnings: CostAggregationWarning[]
}

/** A compact pointer to /kostenuebersicht when the current year has any
 * possible-duplicate warning (see centralCosts.ts,
 * detectCostAggregationWarnings) - reuses that same detection, never a
 * second implementation. Deliberately says only "möglich", never that a
 * duplicate is confirmed or that a specific amount is affected - the data
 * does not support that claim (see centralCosts.ts for why). Renders
 * nothing when there are no warnings for the year. */
export function DashboardAggregationWarning({ warnings }: DashboardAggregationWarningProps) {
  if (warnings.length === 0) return null

  return (
    <div role="alert" className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
      <p className="font-medium">⚠ Möglicher Überschneidungsfall</p>
      <Link to={ROUTES.costOverview} className="mt-1 inline-flex min-h-11 items-center font-medium underline">
        Details in der Kostenübersicht
      </Link>
    </div>
  )
}

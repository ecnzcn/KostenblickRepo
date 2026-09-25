import { formatCurrency } from '../../../utils/formatters'
import type { RunningContractCosts } from '../costOverview.types'

interface CostOverviewRunningContractCostsProps {
  costs: RunningContractCosts
}

/** Separate from CostOverviewSummaryCard's actual-cost total - contractual
 * monthly/yearly cost of currently active contracts, never added into the
 * actual-cost figures above (see domain/usecases/contracts.ts,
 * calculateRunningContractCosts, and CostOverviewSummaryCard's own
 * footnote making the same exclusion explicit). */
export function CostOverviewRunningContractCosts({ costs }: CostOverviewRunningContractCostsProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">Laufende Vertragskosten</p>
      {costs.monthly === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Keine aktiven Verträge mit laufenden Kosten.</p>
      ) : (
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-lg font-semibold text-neutral-900">{formatCurrency(costs.monthly)} / Monat</p>
          <p className="text-sm text-neutral-500">{formatCurrency(costs.yearly)} / Jahr</p>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-400">
        Vertraglich vereinbart - nicht Teil der tatsächlichen Kosten oben.
      </p>
    </div>
  )
}

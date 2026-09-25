import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { formatCurrency } from '../../../utils/formatters'
import type { RunningContractCosts } from '../dashboard.types'

interface RunningContractCostsCardProps {
  costs: RunningContractCosts
}

/** Shows the contractual monthly/yearly cost of currently active contracts
 * - deliberately separate from the actual-cost cards above (Monats-/
 * Jahreskosten), never added into them, since these are planned/contractual
 * figures rather than money that has actually been spent (see
 * domain/usecases/contracts.ts, calculateRunningContractCosts). */
export function RunningContractCostsCard({ costs }: RunningContractCostsCardProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Laufende Vertragskosten</h2>
      {costs.monthly === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Keine aktiven Verträge mit laufenden Kosten.</p>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-lg font-semibold text-neutral-900">{formatCurrency(costs.monthly)} / Monat</p>
          <p className="text-sm text-neutral-500">{formatCurrency(costs.yearly)} / Jahr</p>
          <p className="mt-1 text-xs text-neutral-400">
            Vertraglich vereinbart - nicht in den tatsächlichen Kosten oben enthalten.
          </p>
        </div>
      )}
      <Link to={ROUTES.contracts} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent">
        Verträge anzeigen
      </Link>
    </section>
  )
}

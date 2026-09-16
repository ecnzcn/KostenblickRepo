import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'

const ACTIONS = [
  { label: '+ Abrechnung', to: ROUTES.bills },
  { label: '+ Vertrag', to: ROUTES.contracts },
  { label: 'Kosten erfassen', to: ROUTES.statistics },
] as const

export function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900">Schnellzugriff</h2>
      <div className="grid grid-cols-3 gap-3">
        {ACTIONS.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="flex min-h-16 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-2 text-center text-sm font-medium text-neutral-700 shadow-sm"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  )
}

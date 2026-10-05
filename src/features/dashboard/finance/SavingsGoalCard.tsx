import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import type { SavingsProgress } from '../../../domain/usecases/finance/savingsGoal'
import { formatCurrency } from '../../../utils/formatters'

/** Phase 14H: progress towards the monthly savings goal (O-5). */
export function SavingsGoalCard({ progress }: { progress?: SavingsProgress }) {
  if (!progress) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-4 text-sm" aria-label="Sparziel">
        <p className="text-neutral-600">Noch kein Sparziel festgelegt.</p>
        <Link to={ROUTES.settings} className="inline-flex min-h-11 items-center font-medium text-accent">
          Sparziel festlegen
        </Link>
      </section>
    )
  }

  const description = progress.negative
    ? `In diesem Monat wurde ${formatCurrency(Math.abs(progress.achieved))} mehr ausgegeben als eingenommen.`
    : progress.reached
      ? `Ziel erreicht: ${formatCurrency(progress.achieved)} übrig und gespart.`
      : `${formatCurrency(progress.achieved)} von ${formatCurrency(progress.target)} übrig und gespart.`

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm" aria-label="Sparziel">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm text-neutral-600">Sparziel</h3>
        <p className="text-xl font-semibold tabular-nums text-neutral-900">{formatCurrency(progress.target)}</p>
      </div>
      <div
        className="mt-3 h-2.5 rounded-full bg-neutral-100"
        role="progressbar"
        aria-label="Fortschritt Sparziel"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.percent} % erreicht`}
      >
        <div className="h-2.5 rounded-full bg-accent" style={{ width: `${progress.ratio * 100}%` }} />
      </div>
      <p className="mt-2 text-sm font-medium text-neutral-900">{progress.percent} % erreicht</p>
      <p className={`text-xs ${progress.negative ? 'text-red-700' : 'text-neutral-500'}`}>{description}</p>
    </section>
  )
}

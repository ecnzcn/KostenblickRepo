import type { ReactNode } from 'react'
import type { FlowTotals, MonthComparison } from '../../../domain/usecases/finance/monthlyOverview'
import { formatCurrency, formatPercentChange } from '../../../utils/formatters'

type Tone = 'good' | 'bad' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  good: 'text-emerald-700',
  bad: 'text-red-700',
  neutral: 'text-neutral-500',
}

function Icon({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${className}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

const ICONS = {
  income: (
    <Icon className="bg-emerald-50 text-emerald-700">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Icon>
  ),
  expenses: (
    <Icon className="bg-red-50 text-red-700">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Icon>
  ),
  balance: (
    <Icon className="bg-blue-50 text-blue-700">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Icon>
  ),
  saved: (
    <Icon className="bg-violet-50 text-violet-700">
      <path d="M5 11a7 7 0 0 1 14 0v5H5zM9 20h6M12 4V2" />
    </Icon>
  ),
}

function percentLine(percent: number | null | undefined, increaseIsGood: boolean, previous: number | undefined): { text: string; tone: Tone } {
  if (percent === null) return { text: `Vormonat ${formatCurrency(previous ?? 0)}`, tone: 'neutral' }
  if (percent === undefined) return { text: '', tone: 'neutral' }
  const arrow = percent > 0 ? '↗' : percent < 0 ? '↘' : '→'
  const tone: Tone = percent === 0 ? 'neutral' : percent > 0 === increaseIsGood ? 'good' : 'bad'
  return { text: `${arrow} ${formatPercentChange(percent)} vs. Vormonat`, tone }
}

function differenceLine(difference: number | undefined): { text: string; tone: Tone } {
  if (difference === undefined) return { text: '', tone: 'neutral' }
  const sign = difference > 0 ? '+' : ''
  return { text: `${sign}${formatCurrency(difference)} vs. Vormonat`, tone: difference > 0 ? 'good' : difference < 0 ? 'bad' : 'neutral' }
}

function Card({ label, icon, amount, change, hint }: { label: string; icon: ReactNode; amount: number; change: { text: string; tone: Tone }; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm text-neutral-600">{label}</h3>
      </div>
      <p className="text-xl font-semibold tabular-nums text-neutral-900 sm:text-2xl">{formatCurrency(amount)}</p>
      {change.text ? <p className={`text-xs ${TONE_CLASS[change.tone]}`}>{change.text}</p> : null}
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </div>
  )
}

const UNAVAILABLE_TEXT: Record<NonNullable<MonthComparison['unavailableReason']>, string> = {
  no_previous_month: 'Keine Buchungen im Vormonat – kein Vergleich.',
  incomplete: 'Vergleich nur, wenn beide Monate vollständig importiert sind.',
}

/** Einnahmen, Ausgaben, Saldo (O-5: Einnahmen − Ausgaben − Gespart) and
 * Gespart for one month, with the change to the previous month. */
export function FinanceKpiCards({ totals, comparison }: { totals: FlowTotals; comparison: MonthComparison }) {
  const previous = comparison.previous
  return (
    <section aria-label="Kennzahlen" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Einnahmen" icon={ICONS.income} amount={totals.income} change={percentLine(comparison.incomePercent, true, previous?.income)} />
        <Card label="Ausgaben" icon={ICONS.expenses} amount={totals.expenses} change={percentLine(comparison.expensesPercent, false, previous?.expenses)} />
        <Card
          label="Saldo"
          icon={ICONS.balance}
          amount={totals.balance}
          change={differenceLine(comparison.balanceDifference)}
          hint="Einnahmen − Ausgaben − Gespart"
        />
        <Card label="Gespart" icon={ICONS.saved} amount={totals.saved} change={differenceLine(comparison.savedDifference)} hint="Auf eigene Spar-/Anlagekonten" />
      </div>
      {comparison.unavailableReason ? <p className="text-xs text-neutral-500">{UNAVAILABLE_TEXT[comparison.unavailableReason]}</p> : null}
    </section>
  )
}

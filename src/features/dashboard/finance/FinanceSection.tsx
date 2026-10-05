import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import type { FinanceOverview } from '../../../domain/usecases/finance/monthlyOverview'
import type { SavingsProgress } from '../../../domain/usecases/finance/savingsGoal'
import type { Tip } from '../../../domain/usecases/finance/tips'
import { formatMonthKey } from '../../../utils/formatters'
import { ExpenseGroups } from './ExpenseGroups'
import { FinanceKpiCards } from './FinanceKpiCards'
import { MonthFlowChart } from './MonthFlowChart'
import { RecentTransactions } from './RecentTransactions'
import { SavingsGoalCard } from './SavingsGoalCard'
import { TipCard } from './TipCard'

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Phase 14G: the dashboard's money part - only bookings (E7). */
interface FinanceSectionProps {
  overview: FinanceOverview
  savingsProgress?: SavingsProgress
  tips: Tip[]
}

export function FinanceSection({ overview, savingsProgress, tips }: FinanceSectionProps) {
  const monthName = formatMonthKey(overview.month)
  return (
    <div className="flex flex-col gap-4">
      {!overview.complete ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-neutral-800">
          {monthName} ist noch nicht vollständig importiert – die Zahlen zeigen nur die vorhandenen Buchungen.
        </p>
      ) : null}

      <FinanceKpiCards totals={overview.totals} comparison={overview.comparison} />
      <SavingsGoalCard progress={savingsProgress} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Einnahmen und Ausgaben im Monatsverlauf" aside={<span className="text-xs text-neutral-500">aufsummiert</span>}>
          <MonthFlowChart points={overview.daily} />
        </Card>
        <Card title="Letzte Buchungen" aside={<Link to={`${ROUTES.transactions}?monat=${overview.month}`} className="text-sm font-medium text-accent">Alle anzeigen</Link>}>
          <RecentTransactions entries={overview.recent} />
        </Card>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${tips.length > 0 ? 'xl:grid-cols-[3fr_2fr]' : ''}`}>
        <Card title="Ausgaben nach Kategorie" aside={<span className="text-xs text-neutral-500">{monthName}</span>}>
          <ExpenseGroups groups={overview.groups} total={overview.totals.expenses} />
        </Card>
        <TipCard tips={tips} />
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import type { FinanceOverview } from '../../../domain/usecases/finance/monthlyOverview'
import { formatMonthKey } from '../../../utils/formatters'
import { ExpenseGroups } from './ExpenseGroups'
import { FinanceKpiCards } from './FinanceKpiCards'
import { MonthFlowChart } from './MonthFlowChart'
import { RecentTransactions } from './RecentTransactions'

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
export function FinanceSection({ overview }: { overview: FinanceOverview }) {
  const monthName = formatMonthKey(overview.month)
  return (
    <div className="flex flex-col gap-4">
      {!overview.complete || overview.uncategorizedCount > 0 ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-neutral-800">
          {!overview.complete ? <p>{monthName} ist noch nicht vollständig importiert – die Zahlen zeigen nur die vorhandenen Buchungen.</p> : null}
          {overview.uncategorizedCount > 0 ? (
            <p>
              {overview.uncategorizedCount === 1 ? '1 Buchung ist' : `${overview.uncategorizedCount} Buchungen sind`} noch ohne Kategorie.{' '}
              <Link to={`${ROUTES.transactions}?monat=${overview.month}&kategorie=ohne`} className="font-medium text-accent">
                Zuordnen
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <FinanceKpiCards totals={overview.totals} comparison={overview.comparison} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Einnahmen und Ausgaben im Monatsverlauf" aside={<span className="text-xs text-neutral-500">aufsummiert</span>}>
          <MonthFlowChart points={overview.daily} />
        </Card>
        <Card title="Letzte Buchungen" aside={<Link to={`${ROUTES.transactions}?monat=${overview.month}`} className="text-sm font-medium text-accent">Alle anzeigen</Link>}>
          <RecentTransactions entries={overview.recent} />
        </Card>
      </div>

      <Card title="Ausgaben nach Kategorie" aside={<span className="text-xs text-neutral-500">{monthName}</span>}>
        <ExpenseGroups groups={overview.groups} total={overview.totals.expenses} />
      </Card>
    </div>
  )
}

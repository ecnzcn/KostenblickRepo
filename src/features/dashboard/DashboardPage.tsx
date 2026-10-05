import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/navigation'
import { formatMonthKey } from '../../utils/formatters'
import { DashboardError } from './components/DashboardError'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { DocumentsSummaryCard } from './components/DocumentsSummaryCard'
import { LatestBillCard } from './components/LatestBillCard'
import { QuickActions } from './components/QuickActions'
import { RunningContractCostsCard } from './components/RunningContractCostsCard'
import { UpcomingContractsCard } from './components/UpcomingContractsCard'
import { FinanceEmptyState } from './finance/FinanceEmptyState'
import { FinanceSection } from './finance/FinanceSection'
import { useDashboardData } from './hooks/useDashboardData'
import { useFinanceOverview } from './hooks/useFinanceOverview'

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Phase 14G: money figures ("Kontobewegungen") come only from bookings
 * (E7). Bills, waste costs and manual costs keep their own view on
 * /kostenuebersicht ("erfasste Kosten") - adding them here would count
 * bills paid from the giro account twice.
 */
export function DashboardPage() {
  const household = useDashboardData()
  const finance = useFinanceOverview(todayIso())

  const loading = household.loading || finance.loading
  const failed = Boolean(household.error) || finance.error

  return (
    <>
      <DashboardHeader userDisplayName={household.data?.userDisplayName}>
        {finance.data && finance.data.months.length > 0 && finance.month ? (
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="sr-only">Monat</span>
            <select
              value={finance.month}
              onChange={(event) => finance.setMonth(event.target.value)}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900"
            >
              {finance.data.months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(month)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </DashboardHeader>

      {loading ? (
        <DashboardSkeleton />
      ) : failed || !household.data ? (
        <DashboardError
          onRetry={() => {
            household.refetch()
            finance.refetch()
          }}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="finance-title" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="finance-title" className="text-lg font-semibold text-neutral-900">
                Kontobewegungen
              </h2>
              <Link to={ROUTES.transactions} className="text-sm font-medium text-accent">
                Buchungen →
              </Link>
            </div>
            {finance.overview ? <FinanceSection overview={finance.overview} /> : <FinanceEmptyState />}
          </section>

          <section aria-labelledby="household-title" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="household-title" className="text-lg font-semibold text-neutral-900">
                Verträge & Haushalt
              </h2>
              <Link to={ROUTES.costOverview} className="text-sm font-medium text-accent">
                Erfasste Kosten →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <UpcomingContractsCard deadlines={household.data.upcomingContracts} />
              <RunningContractCostsCard costs={household.data.runningContractCosts} />
              <LatestBillCard bill={household.data.latestBill} />
              <DocumentsSummaryCard summary={household.data.documentsSummary} />
            </div>
            <QuickActions />
          </section>
        </div>
      )}
    </>
  )
}

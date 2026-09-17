import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/navigation'
import { CategoryCostChart } from './components/CategoryCostChart'
import { CostTrendChart } from './components/CostTrendChart'
import { DashboardError } from './components/DashboardError'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardSkeleton } from './components/DashboardSkeleton'
import { DocumentsSummaryCard } from './components/DocumentsSummaryCard'
import { LatestBillCard } from './components/LatestBillCard'
import { MonthlyCostCard } from './components/MonthlyCostCard'
import { QuickActions } from './components/QuickActions'
import { UpcomingContractsCard } from './components/UpcomingContractsCard'
import { WasteCostsSummaryCard } from './components/WasteCostsSummaryCard'
import { YearlyCostCard } from './components/YearlyCostCard'
import { useDashboardData } from './hooks/useDashboardData'

export function DashboardPage() {
  const { data, loading, error, refetch } = useDashboardData()
  const now = new Date()

  return (
    <>
      <DashboardHeader userDisplayName={data?.userDisplayName} referenceDate={now} />

      {loading ? (
        <DashboardSkeleton />
      ) : error || !data ? (
        <DashboardError onRetry={refetch} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">Kosten</h2>
            <Link to={ROUTES.costOverview} className="text-sm font-medium text-accent">
              Kostenübersicht →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MonthlyCostCard
              amount={data.currentMonthCost}
              changePercent={data.currentMonthChangePercent}
              referenceDate={now}
            />
            <YearlyCostCard
              amount={data.currentYearCost}
              changePercent={data.currentYearChangePercent}
              referenceDate={now}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CostTrendChart monthlyCosts={data.monthlyCosts} />
            <CategoryCostChart categories={data.categoryCosts} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingContractsCard deadlines={data.upcomingContracts} />
            <LatestBillCard bill={data.latestBill} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DocumentsSummaryCard summary={data.documentsSummary} />
            <WasteCostsSummaryCard summary={data.wasteCostsSummary} />
          </div>

          <QuickActions />
        </div>
      )}
    </>
  )
}

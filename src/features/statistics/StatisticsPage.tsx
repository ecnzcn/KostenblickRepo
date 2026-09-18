import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { InfoNote } from '../../components/InfoNote'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import { BillDiscrepancyNotice } from './components/BillDiscrepancyNotice'
import { CategoryStatisticsChart } from './components/CategoryStatisticsChart'
import { MonthlyCostChart } from './components/MonthlyCostChart'
import { StatisticsSummaryCards } from './components/StatisticsSummaryCards'
import { TopCostPositionsList } from './components/TopCostPositionsList'
import { YearComparisonChart } from './components/YearComparisonChart'
import { YearSelector } from './components/YearSelector'
import { useStatisticsData } from './hooks/useStatisticsData'

export function StatisticsPage() {
  const { data, loading, error, year, setYear, refetch } = useStatisticsData()

  return (
    <>
      <PageHeader title="Statistik" subtitle="Kosten nach Monat, Jahr und Kategorie" />

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message="Statistik konnte nicht geladen werden." onRetry={refetch} />
      ) : data.years.length === 0 ? (
        <EmptyState message="Noch keine Kostendaten vorhanden. Importiere deine erste Abrechnung, um Statistiken zu sehen." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <YearSelector years={data.years} selectedYear={year} onChange={setYear} />
          </div>

          <StatisticsSummaryCards summary={data.summary} />

          <InfoNote
            message="Die Statistik zeigt ausschließlich Abrechnungskosten. Müllkosten, manuell erfasste Kosten und Vertragskosten sind hier nicht enthalten - deshalb kann die Kostenübersicht eine andere Summe zeigen."
            linkTo={ROUTES.costOverview}
            linkLabel="Zur Kostenübersicht"
          />

          <BillDiscrepancyNotice summary={data.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MonthlyCostChart monthlyStatistics={data.monthlyStatistics} hasMonthlyData={data.hasMonthlyData} />
            <CategoryStatisticsChart categories={data.categories} />
          </div>

          <TopCostPositionsList positions={data.topCostPositions} />

          <YearComparisonChart yearStatistics={data.yearStatistics} />
        </div>
      )}
    </>
  )
}

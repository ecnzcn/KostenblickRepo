import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { CostOverviewCategoryChart } from './components/CostOverviewCategoryChart'
import { CostOverviewMonthlyChart } from './components/CostOverviewMonthlyChart'
import { CostOverviewSummaryCard } from './components/CostOverviewSummaryCard'
import { CostOverviewWarnings } from './components/CostOverviewWarnings'
import { CostOverviewYearSelector } from './components/CostOverviewYearSelector'
import { useCostOverviewData } from './hooks/useCostOverviewData'

export function CostOverviewPage() {
  const { data, loading, error, year, setYear, refetch } = useCostOverviewData()

  return (
    <>
      <PageHeader
        title="Kostenübersicht"
        subtitle="Abrechnungen, Müllkosten und manuell erfasste Kosten in einer Ansicht"
      />

      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message="Kostenübersicht konnte nicht geladen werden." onRetry={refetch} />
      ) : data.years.length === 0 ? (
        <EmptyState message="Noch keine Kostendaten vorhanden. Erfasse eine Abrechnung, Müllkosten oder manuelle Kosten, um hier eine Übersicht zu sehen." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <CostOverviewYearSelector years={data.years} selectedYear={year} onChange={setYear} />
          </div>

          <CostOverviewSummaryCard summary={data.summary} />

          <CostOverviewWarnings warnings={data.warnings} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CostOverviewMonthlyChart monthly={data.monthly} summary={data.summary} />
            <CostOverviewCategoryChart categories={data.categories} />
          </div>
        </div>
      )}
    </>
  )
}

import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'

export function StatisticsPage() {
  return (
    <>
      <PageHeader title="Statistik" subtitle="Kosten nach Monat, Jahr und Kategorie" />
      <EmptyState message="Sobald Kosten erfasst sind, siehst du hier deine Auswertungen." />
    </>
  )
}

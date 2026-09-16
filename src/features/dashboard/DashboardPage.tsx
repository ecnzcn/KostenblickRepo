import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Home" subtitle="Deine Kostenübersicht auf einen Blick" />
      <EmptyState message="Noch keine Daten vorhanden. Lege eine Immobilie an, um loszulegen." />
    </>
  )
}

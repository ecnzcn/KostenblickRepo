import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'

export function BillsPage() {
  return (
    <>
      <PageHeader title="Abrechnungen" subtitle="Nebenkostenabrechnungen verwalten" />
      <EmptyState message="Noch keine Abrechnung hinzugefügt." />
    </>
  )
}

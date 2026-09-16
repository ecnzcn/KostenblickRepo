import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/layout/PageHeader'

export function ContractsPage() {
  return (
    <>
      <PageHeader title="Verträge" subtitle="Strom-, Internet- und weitere Verträge" />
      <EmptyState message="Noch keine Verträge hinterlegt." />
    </>
  )
}

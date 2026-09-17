import { EmptyState } from '../../components/EmptyState'
import { ErrorState } from '../../components/ErrorState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/layout/PageHeader'
import { useToast } from '../../components/feedback/useToast'
import { ReminderGroup } from './components/ReminderGroup'
import { useReminders } from './hooks/useReminders'

export function RemindersPage() {
  const { overview, loading, error, refetch, dismiss } = useReminders()
  const { showToast } = useToast()

  async function handleDismiss(id: string) {
    try {
      await dismiss(id)
      showToast('Erinnerung erledigt')
    } catch {
      showToast('Konnte nicht als erledigt markiert werden. Bitte versuche es erneut.', 'error')
    }
  }

  const isEmpty =
    overview !== undefined &&
    overview.overdue.length === 0 &&
    overview.dueToday.length === 0 &&
    overview.thisWeek.length === 0 &&
    overview.later.length === 0

  return (
    <>
      <PageHeader title="Erinnerungen" subtitle="Anstehende Vertragskündigungen im Blick" />

      {loading ? (
        <LoadingState />
      ) : error || !overview ? (
        <ErrorState message="Erinnerungen konnten nicht geladen werden." onRetry={refetch} />
      ) : isEmpty ? (
        <EmptyState message="Keine anstehenden Erinnerungen. Aktuell gibt es keine fälligen Vertragsfristen." />
      ) : (
        <div className="flex flex-col gap-6">
          <ReminderGroup title="Überfällig" entries={overview.overdue} onDismiss={handleDismiss} />
          <ReminderGroup title="Heute" entries={overview.dueToday} onDismiss={handleDismiss} />
          <ReminderGroup title="In 7 Tagen" entries={overview.thisWeek} onDismiss={handleDismiss} />
          <ReminderGroup title="Später" entries={overview.later} onDismiss={handleDismiss} />
        </div>
      )}
    </>
  )
}

import type { NotificationService } from '../../../services/notifications/NotificationService'
import { notificationService as defaultNotificationService } from '../../../services/notifications/activeNotificationService'
import { reminderRepository } from '../../repositories/indexedDbRepositories'
import { formatDate } from '../../../utils/formatters'
import { getRemindersOverview } from './reminderQueries'

/**
 * The one reliable moment Phase 6 supports for surfacing a due reminder:
 * "beim App-Start prüfen, ob etwas fällig ist" - not a scheduled
 * background job, since a local-only PWA cannot guarantee one fires while
 * closed (see CLAUDE.md/NotificationService). Called once on app mount.
 *
 * For every reminder that is overdue or due today and hasn't already been
 * notified about (status still 'pending'), this tries a local
 * notification and marks the reminder 'sent' so re-opening the app doesn't
 * re-notify for the same reminder every time - the reminder still shows up
 * in /erinnerungen regardless of whether a notification could be shown.
 */
export async function notifyDueReminders(
  referenceDate: Date = new Date(),
  service: NotificationService = defaultNotificationService,
): Promise<number> {
  if (!service.isSupported() || service.getPermissionStatus() !== 'granted') return 0

  const overview = await getRemindersOverview(referenceDate)
  const due = [...overview.overdue, ...overview.dueToday].filter((entry) => entry.reminder.status === 'pending')

  for (const entry of due) {
    service.notify('Kündigungsfrist', {
      body: `${entry.contract.provider}: Kündigung bis ${formatDate(entry.contract.calculatedCancellationDate ?? entry.reminder.reminderDate)}`,
      tag: entry.reminder.id,
    })
    await reminderRepository.save({ ...entry.reminder, status: 'sent' })
  }

  return due.length
}

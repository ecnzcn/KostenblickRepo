import { useEffect } from 'react'
import { notifyDueReminders } from '../domain/usecases/reminders/checkDueReminders'

/** Runs once per app session: checks for due/overdue contract reminders
 * and tries a local notification for each (see checkDueReminders.ts for
 * why this is the app-start check rather than a background job). Errors
 * are swallowed - a failed notification attempt must never break the
 * app's actual UI. */
export function useDueReminderNotifications(): void {
  useEffect(() => {
    notifyDueReminders().catch(() => undefined)
  }, [])
}

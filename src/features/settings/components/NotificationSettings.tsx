import { useState } from 'react'
import { notificationService } from '../../../services/notifications/activeNotificationService'
import type { NotificationPermissionState } from '../../../services/notifications/NotificationService'

const STATUS_LABELS: Record<NotificationPermissionState, string> = {
  unsupported: 'Nicht unterstützt',
  default: 'Unterstützt',
  granted: 'Aktiviert',
  denied: 'Nicht aktiviert',
}

/**
 * Notification permission is only ever requested here, in response to an
 * explicit tap - never automatically on app start (CLAUDE.md, "keine
 * aggressive Permission-Anfrage"). The app works fully without it; this
 * only controls whether notifyDueReminders() can additionally show a
 * local notification for a due reminder.
 */
export function NotificationSettings() {
  const [status, setStatus] = useState<NotificationPermissionState>(() => notificationService.getPermissionStatus())
  const [requesting, setRequesting] = useState(false)

  async function handleRequest() {
    setRequesting(true)
    try {
      const result = await notificationService.requestPermission()
      setStatus(result)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Benachrichtigungen</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Beim Öffnen der App wird geprüft, ob Kündigungsfristen fällig sind. Eine garantierte
        Benachrichtigung, ohne dass die App geöffnet wird, kann eine lokale PWA nicht zusichern.
      </p>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-neutral-700">Status: {STATUS_LABELS[status]}</p>
        {status !== 'unsupported' && status !== 'granted' ? (
          <button
            type="button"
            onClick={handleRequest}
            disabled={requesting}
            className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Benachrichtigungen aktivieren
          </button>
        ) : null}
      </div>
    </section>
  )
}

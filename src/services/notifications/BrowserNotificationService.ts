import type { NotificationPermissionState, NotificationService, NotifyOptions } from './NotificationService'
import { isNotificationSupported } from './notificationSupport'

/**
 * Thin wrapper around the browser's own Notification API. Only shows a
 * notification while this tab/PWA is active (or, on platforms that support
 * it, briefly after via the service worker's notification surface) - see
 * NotificationService's own docs for the limitation this deliberately does
 * not paper over.
 */
export class BrowserNotificationService implements NotificationService {
  isSupported(): boolean {
    return isNotificationSupported()
  }

  getPermissionStatus(): NotificationPermissionState {
    if (!this.isSupported()) return 'unsupported'
    return Notification.permission
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported()) return 'unsupported'
    if (Notification.permission !== 'default') return Notification.permission
    const result = await Notification.requestPermission()
    return result
  }

  notify(title: string, options: NotifyOptions = {}): void {
    if (!this.isSupported() || Notification.permission !== 'granted') return
    try {
      // Fire-and-forget - the browser owns the created Notification's lifecycle.
      new Notification(title, { body: options.body, tag: options.tag })
    } catch {
      // Some browsers (notably iOS Safari outside an installed PWA) throw
      // synchronously even when permission is 'granted' - never crash the
      // app over a best-effort local notification.
    }
  }
}

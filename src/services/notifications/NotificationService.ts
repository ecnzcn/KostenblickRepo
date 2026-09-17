/**
 * The permission state a notification provider can be in - mirrors the
 * browser Notification API's own values ('default' | 'granted' | 'denied')
 * plus an explicit 'unsupported' for environments without the API at all
 * (older Safari, some in-app browsers), so the UI never has to special-case
 * "no Notification global" separately from "user hasn't decided yet".
 */
export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export interface NotifyOptions {
  body?: string
  /** Used to prevent duplicate/stacking notifications for the same
   * underlying reminder if the browser is asked to notify twice. */
  tag?: string
}

/**
 * The only way the rest of the app talks to local notifications - callers
 * never touch `window.Notification` directly. This is a *local* delivery
 * abstraction only: it can show a notification while the app (or its
 * service worker) is active/has recently run, it cannot guarantee a
 * notification fires at a specific future time with the app fully closed.
 * See CLAUDE.md "Notification-Limitierung" for why that's a deliberate,
 * documented limitation rather than an oversight - a Web Push backend or
 * native app could remove it later without any caller of this interface
 * changing.
 */
export interface NotificationService {
  isSupported(): boolean
  getPermissionStatus(): NotificationPermissionState
  /** Resolves once the user has answered (or immediately with the current
   * status if already decided, or if unsupported). Must only be called in
   * response to an explicit user action (e.g. a Settings button) - never
   * on app start, per the "keine aggressive Permission-Anfrage" rule. */
  requestPermission(): Promise<NotificationPermissionState>
  /** No-ops silently (never throws) when unsupported or not granted - a
   * caller can always call notify() without checking status first. */
  notify(title: string, options?: NotifyOptions): void
}

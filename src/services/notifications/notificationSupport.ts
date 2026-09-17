/** Feature detection for the browser Notification API - kept in its own
 * tiny module so both the service implementation and any UI that wants to
 * show/hide notification-related controls can check this without importing
 * the whole BrowserNotificationService. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

import { BrowserNotificationService } from './BrowserNotificationService'
import type { NotificationService } from './NotificationService'

/** The single place that decides which NotificationService implementation
 * is actually used - callers only ever depend on the NotificationService
 * interface, never on BrowserNotificationService directly (mirrors
 * activeOcrService.ts for the OCR abstraction). Unlike OCR, this has no
 * heavy dependency to code-split away, so it's a plain singleton rather
 * than a lazily `import()`-ed one. */
export const notificationService: NotificationService = new BrowserNotificationService()

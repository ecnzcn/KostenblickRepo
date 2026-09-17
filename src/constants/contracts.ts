/** Central thresholds for deriving a Contract's status from its
 * calculatedCancellationDate - kept here so the UI never hardcodes these
 * boundaries itself (see domain/usecases/reminders/contractStatus.ts). */
export const CONTRACT_URGENT_DAYS = 30
export const CONTRACT_UPCOMING_DAYS = 90

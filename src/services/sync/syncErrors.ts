/** Turns Supabase / network errors into short German messages for the UI -
 * never a stack trace or a raw Postgres message. */
export function describeSyncError(error: unknown): string {
  const message = extractMessage(error)
  if (/not_authenticated|JWT|session/i.test(message)) return 'Du bist nicht (mehr) angemeldet. Bitte melde dich erneut an.'
  if (/not_a_member/.test(message)) return 'Du bist kein Mitglied dieses Haushalts.'
  if (/invalid_invite/.test(message)) return 'Dieser Einladungscode ist ungültig, abgelaufen oder bereits verwendet.'
  if (/Token has expired|otp_expired|invalid.*(otp|token)/i.test(message)) return 'Der Code ist falsch oder abgelaufen. Fordere bitte einen neuen an.'
  if (/rate limit|too many/i.test(message)) return 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.'
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(message)) return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.'
  if (/paused|project.*inactive/i.test(message)) return 'Der Sync-Server ist pausiert. Bitte reaktiviere das Projekt im Supabase-Dashboard.'
  if (/unerwartete Antwort|nicht eingerichtet/.test(message)) return message
  return 'Die Synchronisierung ist fehlgeschlagen. Deine Daten auf diesem Gerät bleiben unverändert erhalten.'
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return String(error ?? '')
}

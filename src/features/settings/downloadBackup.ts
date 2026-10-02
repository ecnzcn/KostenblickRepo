import { createBackup, validateBackup } from '../../domain/usecases/backup'

export function backupFileName(now: Date): string {
  return `kostenblick-backup-${now.toISOString().slice(0, 10)}.json`
}

/** Creates a full backup and hands it to the browser as a download.
 * Throws with a German message if the backup is not structurally valid. */
export async function downloadBackup(): Promise<void> {
  const backup = await createBackup()
  if (validateBackup(backup).length > 0) {
    throw new Error('Das Backup konnte nicht korrekt erstellt werden. Bitte versuche es erneut.')
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = backupFileName(new Date())
  anchor.click()
  URL.revokeObjectURL(url)
}

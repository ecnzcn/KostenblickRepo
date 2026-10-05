import { importBatchRepository } from '../repositories/financeRepositories'

const STORAGE_KEY = 'kostenblick.lastBackupAt.v1'

/** When this device last downloaded a backup. A per-device convenience
 * value (localStorage), not domain data - like the reminder intervals. */
export function recordBackupCreated(now: Date = new Date()): void {
  try {
    localStorage.setItem(STORAGE_KEY, now.toISOString())
  } catch {
    // Storage unavailable: the reminder simply cannot show a date.
  }
}

export function getLastBackupAt(): string | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value && !Number.isNaN(Date.parse(value)) ? value : undefined
  } catch {
    return undefined
  }
}

export interface BackupReminder {
  lastBackupAt?: string
  /** Bookings were imported after the last backup (or there is none yet) -
   * they exist only on this device. */
  importedSinceBackup: boolean
}

export async function getBackupReminder(): Promise<BackupReminder> {
  const lastBackupAt = getLastBackupAt()
  const latestImport = (await importBatchRepository.getAll()).map((batch) => batch.importedAt).sort().at(-1)
  return {
    lastBackupAt,
    importedSinceBackup: latestImport !== undefined && (lastBackupAt === undefined || latestImport > lastBackupAt),
  }
}

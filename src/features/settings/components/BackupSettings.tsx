import { useState } from 'react'
import { createBackup, validateBackup } from '../../../domain/usecases/backup'

type ExportStatus = { kind: 'idle' } | { kind: 'exporting' } | { kind: 'success' } | { kind: 'error'; message: string }

function backupFileName(now: Date): string {
  const isoDate = now.toISOString().slice(0, 10)
  return `kostenblick-backup-${isoDate}.json`
}

/**
 * Phase 12B: a full local backup export, downloaded as one JSON file -
 * read-only, never deletes/modifies/compacts anything (see
 * domain/usecases/backup.ts). Restore/import is Phase 12C and does not
 * exist yet - this section only ever produces a file, never reads one
 * back in.
 */
export function BackupSettings() {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })

  async function handleExport() {
    setStatus({ kind: 'exporting' })
    try {
      const backup = await createBackup()
      const errors = validateBackup(backup)
      if (errors.length > 0) {
        setStatus({ kind: 'error', message: 'Das Backup konnte nicht korrekt erstellt werden. Bitte versuche es erneut.' })
        return
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = backupFileName(new Date())
      anchor.click()
      URL.revokeObjectURL(url)

      setStatus({ kind: 'success' })
    } catch (caught) {
      setStatus({
        kind: 'error',
        message:
          caught instanceof Error
            ? `Backup fehlgeschlagen: ${caught.message}`
            : 'Das Backup konnte nicht erstellt werden. Bitte versuche es erneut.',
      })
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Daten &amp; Backup</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Lädt alle gespeicherten Daten (inkl. Dokumente) als eine JSON-Datei herunter - für den Fall eines
        Geräteverlusts oder Gerätewechsels. Ein Wiederherstellen dieser Datei ist noch nicht möglich.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-700" role="status">
          {status.kind === 'exporting'
            ? 'Backup wird erstellt …'
            : status.kind === 'success'
              ? 'Backup wurde heruntergeladen.'
              : status.kind === 'error'
                ? status.message
                : ''}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={status.kind === 'exporting'}
          className="min-h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          Backup exportieren
        </button>
      </div>
    </section>
  )
}

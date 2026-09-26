import { Fragment, useRef, useState } from 'react'
import { createBackup, validateBackup } from '../../../domain/usecases/backup'
import { evaluateBackupFile, performRestore, type BackupEvaluation, type BackupSummary } from '../../../domain/usecases/restore'
import type { KostenblickBackup } from '../../../domain/usecases/backup'
import { formatDate } from '../../../utils/formatters'

type ExportStatus = { kind: 'idle' } | { kind: 'exporting' } | { kind: 'success' } | { kind: 'error'; message: string }

type RestoreState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'confirm'; backup: KostenblickBackup; summary: BackupSummary }
  | { kind: 'restoring' }
  | { kind: 'success' }

function backupFileName(now: Date): string {
  const isoDate = now.toISOString().slice(0, 10)
  return `kostenblick-backup-${isoDate}.json`
}

function describeInvalidEvaluation(evaluation: Exclude<BackupEvaluation, { status: 'ok' }>): string {
  switch (evaluation.status) {
    case 'invalid_json':
      return evaluation.message
    case 'invalid_structure':
      return 'Diese Datei ist kein gültiges Kostenblick-Backup.'
    case 'incompatible':
      return evaluation.errors.join(' ')
    case 'invalid_references':
      return 'Dieses Backup enthält widersprüchliche Daten und kann nicht wiederhergestellt werden.'
  }
}

const SUMMARY_ROWS: { key: keyof BackupSummary['counts']; label: string }[] = [
  { key: 'bills', label: 'Abrechnungen' },
  { key: 'billItems', label: 'Kostenpositionen' },
  { key: 'costEntries', label: 'Kosteneinträge' },
  { key: 'wasteCosts', label: 'Müllkosten' },
  { key: 'contracts', label: 'Verträge' },
  { key: 'reminders', label: 'Erinnerungen' },
  { key: 'documents', label: 'Dokumente' },
  { key: 'documentFiles', label: 'Dateien' },
]

/**
 * Phase 12B: full local backup export, downloaded as one JSON file - read-only,
 * never deletes/modifies/compacts anything (see domain/usecases/backup.ts).
 *
 * Phase 12C: restoring that file back in. Reading, parsing and validating a
 * selected file is strictly read-only (evaluateBackupFile() never touches
 * IndexedDB) - nothing changes until the user has seen the backup's info
 * and explicitly confirms. Restore is a full replace of all local data, not
 * a merge (see domain/usecases/restore.ts).
 */
export function BackupSettings() {
  const [status, setStatus] = useState<ExportStatus>({ kind: 'idle' })
  const [restoreState, setRestoreState] = useState<RestoreState>({ kind: 'idle' })
  const restoreInputRef = useRef<HTMLInputElement>(null)

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

  async function handleFileSelected(file: File | undefined) {
    if (!file) return
    try {
      const text = await file.text()
      const evaluation = evaluateBackupFile(text)
      if (evaluation.status === 'ok') {
        setRestoreState({ kind: 'confirm', backup: evaluation.backup, summary: evaluation.summary })
      } else {
        setRestoreState({ kind: 'error', message: describeInvalidEvaluation(evaluation) })
      }
    } catch {
      setRestoreState({ kind: 'error', message: 'Diese Datei konnte nicht gelesen werden.' })
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = ''
    }
  }

  function handleCancelRestore() {
    setRestoreState({ kind: 'idle' })
  }

  async function handleConfirmRestore() {
    if (restoreState.kind !== 'confirm') return
    const { backup } = restoreState
    setRestoreState({ kind: 'restoring' })
    try {
      await performRestore(backup)
      setRestoreState({ kind: 'success' })
    } catch (caught) {
      setRestoreState({
        kind: 'error',
        message:
          caught instanceof Error
            ? `Wiederherstellung fehlgeschlagen: ${caught.message} Deine bisherigen Daten wurden nicht verändert.`
            : 'Die Wiederherstellung ist fehlgeschlagen. Deine bisherigen Daten wurden nicht verändert.',
      })
    }
  }

  const isRestoring = restoreState.kind === 'restoring'

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Daten &amp; Backup</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Lädt alle gespeicherten Daten (inkl. Dokumente) als eine JSON-Datei herunter - für den Fall eines
        Geräteverlusts oder Gerätewechsels.
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

      <hr className="my-4 border-neutral-200" />

      <h3 className="text-sm font-semibold text-neutral-900">Backup wiederherstellen</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Stellt eine zuvor exportierte Backup-Datei wieder her. Die Datei wird zunächst nur geprüft und angezeigt -
        es wird nichts verändert, bevor du die Wiederherstellung ausdrücklich bestätigst.
      </p>

      {restoreState.kind === 'idle' || restoreState.kind === 'error' ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700">
            Backup-Datei auswählen
            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => handleFileSelected(event.target.files?.[0])}
            />
          </label>
          {restoreState.kind === 'error' ? (
            <p className="text-sm text-red-600" role="alert">
              {restoreState.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {restoreState.kind === 'confirm' ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-neutral-900">Dieses Backup enthält:</p>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm text-neutral-700">
            <dt className="text-neutral-500">Exportiert am</dt>
            <dd>{formatDate(restoreState.summary.exportedAt)}</dd>
            <dt className="text-neutral-500">App-Version</dt>
            <dd>{restoreState.summary.appVersion}</dd>
            {SUMMARY_ROWS.map(({ key, label }) => (
              <Fragment key={key}>
                <dt className="text-neutral-500">{label}</dt>
                <dd>{restoreState.summary.counts[key]}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="mt-3 text-sm font-semibold text-red-700">
            Backup wiederherstellen? Dabei werden die aktuell in Kostenblick gespeicherten Daten durch den Inhalt
            dieses Backups ersetzt. Dieser Vorgang kann nicht automatisch rückgängig gemacht werden.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirmRestore}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-medium text-white"
            >
              Backup wiederherstellen
            </button>
            <button
              type="button"
              onClick={handleCancelRestore}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {isRestoring || restoreState.kind === 'success' ? (
        <p className="mt-3 text-sm text-neutral-700" role="status">
          {isRestoring ? 'Backup wird wiederhergestellt …' : 'Backup wurde erfolgreich wiederhergestellt.'}
        </p>
      ) : null}
    </section>
  )
}

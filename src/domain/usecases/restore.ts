import type { IDBPTransaction, StoreNames, StoreValue } from 'idb'
import { getDatabase } from '../../database/database'
import { DATABASE_VERSION, type DocumentFileRecord, type KostenblickDB } from '../../database/schema'
import { base64ToBlob } from '../../utils/base64'
import {
  BACKUP_FORMAT_VERSION,
  validateBackup,
  type KostenblickBackup,
  type KostenblickBackupData,
} from './backup'

/**
 * Phase 12C: local backup restore. Restoring is a **Human Gate** feature -
 * everything up to and including evaluateBackupFile() is strictly
 * read-only (it never opens a readwrite transaction and never touches
 * IndexedDB at all), so a user can select and inspect a file without any
 * risk. Only performRestore() writes anything, and only after the UI has
 * obtained an explicit, informed confirmation (see BackupSettings.tsx).
 *
 * Restore semantics are a **full replace**, not a merge/upsert/sync: every
 * store in RESTORE_STORE_NAMES is cleared and repopulated exactly from the
 * backup's `data`, including soft-deleted records (deletedAt/syncVersion
 * preserved as-is - see CLAUDE.md's soft-delete rules) and the (always
 * empty in V1) syncQueue, which is restored structurally but never
 * executed/triggers no sync behavior - there is no SyncService to run it.
 */

export interface BackupSummary {
  exportedAt: string
  appVersion: string
  databaseVersion: number
  counts: {
    bills: number
    billItems: number
    costEntries: number
    wasteCosts: number
    contracts: number
    reminders: number
    documents: number
    documentFiles: number
  }
}

export function getBackupSummary(backup: KostenblickBackup): BackupSummary {
  return {
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    databaseVersion: backup.databaseVersion,
    counts: {
      bills: backup.data.bills.length,
      billItems: backup.data.billItems.length,
      costEntries: backup.data.costEntries.length,
      wasteCosts: backup.data.wasteCosts.length,
      contracts: backup.data.contracts.length,
      reminders: backup.data.reminders.length,
      documents: backup.data.documents.length,
      documentFiles: backup.data.documentFiles.length,
    },
  }
}

/**
 * formatVersion/databaseVersion compatibility - deliberately separate from
 * validateBackup()'s purely structural check in backup.ts. A backup can be
 * structurally well-formed and still be from an incompatible version of
 * Kostenblick; there is no automatic format migration in V1 (that is a
 * distinct, future concern from a database schema migration).
 */
export function checkBackupCompatibility(backup: KostenblickBackup): string[] {
  const errors: string[] = []
  if (backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    errors.push('Dieses Backupformat wird von dieser Version von Kostenblick nicht unterstützt.')
  }
  if (backup.databaseVersion !== DATABASE_VERSION) {
    errors.push(
      'Dieses Backup wurde mit einer anderen Datenbankversion von Kostenblick erstellt und kann von dieser Version nicht wiederhergestellt werden.',
    )
  }
  return errors
}

/**
 * Obvious referential-integrity checks - structural plausibility, not a
 * rebuild of the domain's full business-rule validation (which this phase
 * deliberately does not attempt). A dangling BillItem/Reminder/documentId
 * reference indicates a genuinely broken or foreign backup and blocks the
 * restore. A Document without a matching documentFiles entry is
 * deliberately NOT flagged here - that is an already-accepted, tested data
 * state in this app (see backup.integration.test.ts, "does not crash when
 * a Document entity exists without a matching documentFiles blob") that a
 * real backup can legitimately contain, not a sign of a broken backup.
 */
export function validateBackupReferences(data: KostenblickBackupData): string[] {
  const errors: string[] = []
  const billIds = new Set(data.bills.map((bill) => bill.id))
  const contractIds = new Set(data.contracts.map((contract) => contract.id))
  const documentIds = new Set(data.documents.map((document) => document.id))

  for (const item of data.billItems) {
    if (!billIds.has(item.billId)) {
      errors.push(`Kostenposition ${item.id} verweist auf keine vorhandene Abrechnung.`)
    }
  }
  for (const reminder of data.reminders) {
    if (reminder.contractId && !contractIds.has(reminder.contractId)) {
      errors.push(`Erinnerung ${reminder.id} verweist auf keinen vorhandenen Vertrag.`)
    }
  }
  for (const costEntry of data.costEntries) {
    if (costEntry.billId && !billIds.has(costEntry.billId)) {
      errors.push(`Kosteneintrag ${costEntry.id} verweist auf keine vorhandene Abrechnung.`)
    }
  }
  for (const bill of data.bills) {
    if (bill.documentId && !documentIds.has(bill.documentId)) {
      errors.push(`Abrechnung ${bill.id} verweist auf kein vorhandenes Dokument.`)
    }
  }
  for (const contract of data.contracts) {
    if (contract.documentId && !documentIds.has(contract.documentId)) {
      errors.push(`Vertrag ${contract.id} verweist auf kein vorhandenes Dokument.`)
    }
  }
  for (const wasteCost of data.wasteCosts) {
    if (wasteCost.documentId && !documentIds.has(wasteCost.documentId)) {
      errors.push(`Müllkosteneintrag ${wasteCost.id} verweist auf kein vorhandenes Dokument.`)
    }
  }

  return errors
}

export type BackupEvaluation =
  | { status: 'invalid_json'; message: string }
  | { status: 'invalid_structure'; errors: string[] }
  | { status: 'incompatible'; errors: string[] }
  | { status: 'invalid_references'; errors: string[] }
  | { status: 'ok'; backup: KostenblickBackup; summary: BackupSummary }

/**
 * Reads and evaluates a candidate backup file's text content end to end -
 * tiers A-E from the phase spec: not JSON, JSON but not a Kostenblick
 * backup, known-but-incompatible format/database version, structurally
 * valid but referentially broken, or genuinely restorable. Purely
 * synchronous, read-only, and never touches IndexedDB - safe to call for
 * every file the user selects, including ones they then cancel on.
 */
export function evaluateBackupFile(rawText: string): BackupEvaluation {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return { status: 'invalid_json', message: 'Diese Datei ist kein gültiges JSON und kann nicht gelesen werden.' }
  }

  const structuralErrors = validateBackup(parsed)
  if (structuralErrors.length > 0) {
    return { status: 'invalid_structure', errors: structuralErrors }
  }

  const backup = parsed as KostenblickBackup

  const compatibilityErrors = checkBackupCompatibility(backup)
  if (compatibilityErrors.length > 0) {
    return { status: 'incompatible', errors: compatibilityErrors }
  }

  const referenceErrors = validateBackupReferences(backup.data)
  if (referenceErrors.length > 0) {
    return { status: 'invalid_references', errors: referenceErrors }
  }

  return { status: 'ok', backup, summary: getBackupSummary(backup) }
}

const RESTORE_STORE_NAMES: StoreNames<KostenblickDB>[] = [
  'users',
  'properties',
  'bills',
  'billItems',
  'categories',
  'costEntries',
  'wasteCosts',
  'contracts',
  'reminders',
  'documents',
  'documentFiles',
  'syncQueue',
]

async function restoreStore<Name extends StoreNames<KostenblickDB>>(
  tx: IDBPTransaction<KostenblickDB, StoreNames<KostenblickDB>[], 'readwrite'>,
  name: Name,
  records: StoreValue<KostenblickDB, Name>[],
): Promise<void> {
  const store = tx.objectStore(name)
  await store.clear()
  await Promise.all(records.map((record) => store.put(record)))
}

/**
 * Performs the actual restore - the only function in this module that
 * writes anything. Every store in RESTORE_STORE_NAMES is cleared and
 * repopulated from the backup within a single native IndexedDB readwrite
 * transaction spanning all of them, so the operation is genuinely
 * all-or-nothing: if any single put fails partway through (a malformed
 * record, a storage error, ...), the whole transaction aborts and every
 * store is left exactly as it was before this call - never a partially
 * restored, "half old / half new" database. documentFiles are decoded
 * from base64 to real Blobs before the transaction opens (a synchronous,
 * pure step) so the transaction itself never has to await anything that
 * could let it go idle and auto-commit early.
 */
export async function performRestore(backup: KostenblickBackup): Promise<void> {
  const db = await getDatabase()
  const documentFileRecords: DocumentFileRecord[] = backup.data.documentFiles.map((file) => ({
    id: file.id,
    blob: base64ToBlob(file.base64, file.mimeType),
  }))

  const tx = db.transaction(RESTORE_STORE_NAMES, 'readwrite')
  // Attached immediately: if the transaction aborts (native IndexedDB
  // error, or the explicit tx.abort() in the catch block below), tx.done
  // rejects too. The real error is already surfaced via the try/catch
  // below, so this only exists to keep that second, redundant rejection
  // from surfacing as an unhandled promise rejection.
  tx.done.catch(() => undefined)
  try {
    await Promise.all([
      restoreStore(tx, 'users', backup.data.users),
      restoreStore(tx, 'properties', backup.data.properties),
      restoreStore(tx, 'bills', backup.data.bills),
      restoreStore(tx, 'billItems', backup.data.billItems),
      restoreStore(tx, 'categories', backup.data.categories),
      restoreStore(tx, 'costEntries', backup.data.costEntries),
      restoreStore(tx, 'wasteCosts', backup.data.wasteCosts),
      restoreStore(tx, 'contracts', backup.data.contracts),
      restoreStore(tx, 'reminders', backup.data.reminders),
      restoreStore(tx, 'documents', backup.data.documents),
      restoreStore(tx, 'documentFiles', documentFileRecords),
      restoreStore(tx, 'syncQueue', backup.data.syncQueue),
    ])
    await tx.done
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // Transaction already aborted/finished by the native IndexedDB error
      // path above - nothing left to do.
    }
    throw error instanceof Error ? error : new Error('Wiederherstellung fehlgeschlagen.')
  }
}

import { APP_VERSION } from '../../constants/appVersion'
import { DATABASE_VERSION, type DocumentFileRecord } from '../../database/schema'
import { getAllDocumentFiles } from '../../services/storage/IndexedDbDocumentStorageService'
import { blobToBase64 } from '../../utils/base64'
import type {
  Bill,
  BillItem,
  Category,
  Contract,
  CostEntry,
  Document,
  Property,
  Reminder,
  SyncQueueItem,
  User,
  WasteCost,
} from '../models/entities'
import { categoryRepository } from '../repositories/categories'
import {
  billItemRepository,
  billRepository,
  contractRepository,
  costEntryRepository,
  documentRepository,
  propertyRepository,
  reminderRepository,
  userRepository,
  wasteCostRepository,
} from '../repositories/indexedDbRepositories'
import { getPendingSyncChanges } from '../repositories/syncQueue'

/**
 * A full local backup export - a read-only snapshot of every persisted
 * IndexedDB store, including soft-deleted records (this is a real data
 * backup, not a UI export - see CLAUDE.md's soft-delete behavior). Never
 * writes anything back, never purges/compacts, never touches
 * syncVersion/deletedAt.
 *
 * `formatVersion` describes *this backup file's own structure* and is
 * bumped independently whenever that structure changes; `databaseVersion`
 * is simply read from the app's own IndexedDB schema (`DATABASE_VERSION`)
 * rather than duplicated as a separate literal, so the two never drift
 * apart by accident.
 */
export const BACKUP_FORMAT_VERSION = 1

/** A `documentFiles` record serialized losslessly for JSON: the blob's own
 * bytes (base64) plus its MIME type (Blob.type), which is everything
 * needed to reconstruct the exact original Blob later (see
 * utils/base64.ts). Document metadata (filename/size/checksum/…) lives on
 * the `Document` entity itself, not duplicated here. */
export interface BackupDocumentFile {
  id: string
  mimeType: string
  base64: string
}

export interface KostenblickBackupData {
  users: User[]
  properties: Property[]
  bills: Bill[]
  billItems: BillItem[]
  categories: Category[]
  costEntries: CostEntry[]
  wasteCosts: WasteCost[]
  contracts: Contract[]
  reminders: Reminder[]
  documents: Document[]
  documentFiles: BackupDocumentFile[]
  /** Always empty in V1 today - the sync queue exists as prepared
   * infrastructure but has no writer (see CLAUDE.md, "Sync"). Included
   * anyway for a genuinely complete backup of every persisted store,
   * rather than silently omitting one that happens to exist. */
  syncQueue: SyncQueueItem[]
}

export interface KostenblickBackup {
  formatVersion: number
  exportedAt: string
  appVersion: string
  databaseVersion: number
  data: KostenblickBackupData
}

/** Pure assembly of an already-fetched snapshot into the backup shape -
 * directly unit-testable without touching IndexedDB, same pattern as
 * buildCentralCostData/buildStatisticsData. */
export function buildBackup(data: KostenblickBackupData, now: Date = new Date()): KostenblickBackup {
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    appVersion: APP_VERSION,
    databaseVersion: DATABASE_VERSION,
    data,
  }
}

/** Converts every stored document file to its lossless JSON-safe form.
 * Kept separate from createBackup() so it can be tested against
 * in-memory DocumentFileRecords without a real IndexedDB round-trip. */
export async function serializeDocumentFiles(files: DocumentFileRecord[]): Promise<BackupDocumentFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      id: file.id,
      mimeType: file.blob.type,
      base64: await blobToBase64(file.blob),
    })),
  )
}

/**
 * Builds a full backup from the live database - the only function here
 * that touches the repositories. Reads every store exactly once via
 * getAllIncludingDeleted() (soft-deleted records are part of a real
 * backup, see module comment above); Category has no soft-delete concept
 * at all, so categoryRepository.getAll() already returns everything.
 */
export async function createBackup(): Promise<KostenblickBackup> {
  const [
    users,
    properties,
    bills,
    billItems,
    categories,
    costEntries,
    wasteCosts,
    contracts,
    reminders,
    documents,
    documentFileRecords,
    syncQueue,
  ] = await Promise.all([
    userRepository.getAllIncludingDeleted(),
    propertyRepository.getAllIncludingDeleted(),
    billRepository.getAllIncludingDeleted(),
    billItemRepository.getAllIncludingDeleted(),
    categoryRepository.getAll(),
    costEntryRepository.getAllIncludingDeleted(),
    wasteCostRepository.getAllIncludingDeleted(),
    contractRepository.getAllIncludingDeleted(),
    reminderRepository.getAllIncludingDeleted(),
    documentRepository.getAllIncludingDeleted(),
    getAllDocumentFiles(),
    getPendingSyncChanges(),
  ])

  const documentFiles = await serializeDocumentFiles(documentFileRecords)

  return buildBackup({
    users,
    properties,
    bills,
    billItems,
    categories,
    costEntries,
    wasteCosts,
    contracts,
    reminders,
    documents,
    documentFiles,
    syncQueue,
  })
}

const EXPECTED_DATA_KEYS: (keyof KostenblickBackupData)[] = [
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

/**
 * Structural sanity check run on a just-built backup before it is
 * offered for download - not a restore/import validation (that is Phase
 * 12C's responsibility). Catches an obviously malformed object (wrong
 * types, missing sections, a documentFile that didn't serialize) before
 * the user ever sees a broken file, rather than silently downloading
 * something unusable.
 */
export function validateBackup(backup: unknown): string[] {
  const errors: string[] = []
  if (typeof backup !== 'object' || backup === null) {
    return ['Backup ist kein gültiges Objekt.']
  }
  const candidate = backup as Partial<KostenblickBackup>

  if (typeof candidate.formatVersion !== 'number') errors.push('formatVersion fehlt oder ist ungültig.')
  if (typeof candidate.exportedAt !== 'string' || Number.isNaN(new Date(candidate.exportedAt).getTime())) {
    errors.push('exportedAt fehlt oder ist ungültig.')
  }
  if (typeof candidate.appVersion !== 'string' || !candidate.appVersion) errors.push('appVersion fehlt.')
  if (typeof candidate.databaseVersion !== 'number') errors.push('databaseVersion fehlt oder ist ungültig.')

  if (typeof candidate.data !== 'object' || candidate.data === null) {
    errors.push('data fehlt.')
    return errors
  }

  for (const key of EXPECTED_DATA_KEYS) {
    if (!Array.isArray(candidate.data[key])) errors.push(`data.${key} fehlt oder ist kein Array.`)
  }

  for (const file of candidate.data.documentFiles ?? []) {
    if (typeof file !== 'object' || file === null) {
      errors.push('Ein documentFiles-Eintrag ist ungültig.')
      continue
    }
    const candidateFile = file as Partial<BackupDocumentFile>
    if (!candidateFile.id || typeof candidateFile.base64 !== 'string' || !candidateFile.mimeType) {
      errors.push(`documentFiles-Eintrag ${candidateFile.id ?? '(ohne id)'} ist unvollständig.`)
    }
  }

  return errors
}

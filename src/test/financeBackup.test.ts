// Node environment, like restore.integration.test.ts: real backup/restore
// round-trips through fake-indexeddb.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { deleteDatabase } from '../database/database'
import { DATABASE_VERSION } from '../database/schema'
import type { Account, Category, ImportBatch, Transaction } from '../domain/models/entities'
import { categoryRepository } from '../domain/repositories/categories'
import {
  accountRepository,
  categoryRuleRepository,
  importBatchRepository,
  savingsGoalRepository,
  transactionRepository,
} from '../domain/repositories/financeRepositories'
import { BACKUP_FORMAT_VERSION, buildBackup, createBackup, validateBackup, type KostenblickBackup, type KostenblickBackupData } from '../domain/usecases/backup'
import {
  categoriesToRestore,
  checkBackupCompatibility,
  describeBookingLoss,
  evaluateBackupFile,
  performRestore,
  validateBackupReferences,
} from '../domain/usecases/restore'

const account: Account = {
  id: 'account-1',
  name: 'Girokonto',
  bank: 'sparkasse',
  type: 'giro',
  last4: '0001',
  identifierHash: 'hash',
  identifierSalt: 'salt',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const batch: ImportBatch = {
  id: 'batch-1',
  accountId: account.id,
  filename: 'umsaetze.csv',
  fileChecksum: 'sha',
  importedAt: '2026-09-01T00:00:00.000Z',
  periodFrom: '2026-08-01',
  periodTo: '2026-08-31',
  counts: { total: 1, new: 1, duplicates: 0, skippedPending: 0 },
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    accountId: account.id,
    bookingDate: '2026-08-15',
    amount: -42.5,
    currency: 'EUR',
    counterpartyName: 'Rewe',
    purpose: 'Einkauf',
    bookingText: 'KARTENZAHLUNG',
    categoryId: 'groceries',
    categorySource: 'bank',
    flowType: 'expense',
    flowTypeSource: 'auto',
    importBatchId: batch.id,
    dedupeKey: `key-${id}:0`,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const emptyData: KostenblickBackupData = {
  users: [],
  properties: [],
  bills: [],
  billItems: [],
  categories: [],
  costEntries: [],
  wasteCosts: [],
  contracts: [],
  reminders: [],
  documents: [],
  documentFiles: [],
  syncQueue: [],
  accounts: [],
  transactions: [],
  importBatches: [],
  categoryRules: [],
  savingsGoals: [],
}

/** A backup file exactly as release 1.1 wrote it: format 1, database 2, the
 * eleven pre-Phase-14 categories and no finance sections at all. */
function releaseOneOneBackup(data: Partial<KostenblickBackupData> = {}): KostenblickBackup {
  const { accounts: _a, transactions: _t, importBatches: _i, categoryRules: _c, savingsGoals: _s, ...v1Data } = { ...emptyData, ...data }
  const legacyCategories: Category[] = DEFAULT_CATEGORIES.slice(0, 11).map(({ group: _group, ...category }) => category)
  return {
    formatVersion: 1,
    exportedAt: '2026-09-01T00:00:00.000Z',
    appVersion: '1.1.0',
    databaseVersion: 2,
    data: { ...v1Data, categories: legacyCategories } as KostenblickBackupData,
  }
}

async function seedFinanceData(): Promise<void> {
  await accountRepository.save(account)
  await importBatchRepository.save(batch)
  await transactionRepository.saveMany([transaction('t1'), transaction('t2', { amount: 2850, flowType: 'income' })])
  await categoryRuleRepository.save({
    id: 'rule-1',
    field: 'counterpartyName',
    matchType: 'contains',
    pattern: 'rewe',
    categoryId: 'groceries',
    priority: 1,
    createdFrom: 'manual',
    createdAt: '',
    updatedAt: '',
  })
  await savingsGoalRepository.save({ id: 'goal', monthlyTarget: 600, createdAt: '', updatedAt: '' })
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('backup format 2 (pure)', () => {
  it('writes the current format and database version', () => {
    const backup = buildBackup(emptyData)
    expect(backup.formatVersion).toBe(2)
    expect(backup.databaseVersion).toBe(DATABASE_VERSION)
  })

  it('requires the finance sections from format 2 on', () => {
    const { transactions: _omitted, ...data } = emptyData
    const errors = validateBackup({ ...buildBackup(emptyData), data })
    expect(errors).toContain('data.transactions fehlt oder ist kein Array.')
  })

  it('accepts a release-1.1 backup without finance sections', () => {
    expect(validateBackup(releaseOneOneBackup())).toEqual([])
    expect(checkBackupCompatibility(releaseOneOneBackup())).toEqual([])
  })

  it('rejects formats and database versions it does not know', () => {
    const current = buildBackup(emptyData)
    expect(checkBackupCompatibility({ ...current, formatVersion: BACKUP_FORMAT_VERSION + 1 })).toHaveLength(1)
    expect(checkBackupCompatibility({ ...current, databaseVersion: 1 })).toHaveLength(1)
    expect(checkBackupCompatibility({ ...current, databaseVersion: DATABASE_VERSION + 1 })).toHaveLength(1)
  })

  it('evaluates a release-1.1 file as restorable, with empty finance stores', () => {
    const evaluation = evaluateBackupFile(JSON.stringify(releaseOneOneBackup()))
    expect(evaluation.status).toBe('ok')
    if (evaluation.status !== 'ok') return
    expect(evaluation.backup.data.transactions).toEqual([])
    expect(evaluation.summary.counts.transactions).toBe(0)
  })

  it('flags bookings without their account or import', () => {
    const errors = validateBackupReferences({ ...emptyData, transactions: [transaction('t1')] })
    expect(errors).toEqual([
      'Buchung t1 verweist auf kein vorhandenes Konto.',
      'Buchung t1 verweist auf keinen vorhandenen Import.',
    ])
  })

  it('tolerates a booking linked to a contract that no longer exists', () => {
    const data = { ...emptyData, accounts: [account], importBatches: [batch], transactions: [transaction('t1', { contractId: 'gone' })] }
    expect(validateBackupReferences(data)).toEqual([])
  })

  it('adds default categories missing from an older backup, keeping its own', () => {
    const own: Category = { id: 'other', name: 'Diverses', icon: '•', type: 'both', createdAt: '', updatedAt: '' }
    const restored = categoriesToRestore([own])
    expect(restored).toHaveLength(DEFAULT_CATEGORIES.length)
    expect(restored.find((category) => category.id === 'other')?.name).toBe('Diverses')
  })
})

describe('describeBookingLoss', () => {
  it('says nothing when no booking would be lost', () => {
    expect(describeBookingLoss(0, 0)).toBeNull()
    expect(describeBookingLoss(5, 5)).toBeNull()
    expect(describeBookingLoss(7, 5)).toBeNull()
  })

  it('names the loss when the backup has no or fewer bookings', () => {
    expect(describeBookingLoss(0, 1)).toBe('Dieses Backup enthält keine Buchungen. Die 1 Buchung auf diesem Gerät wird gelöscht.')
    expect(describeBookingLoss(0, 12)).toBe('Dieses Backup enthält keine Buchungen. Die 12 Buchungen auf diesem Gerät werden gelöscht.')
    expect(describeBookingLoss(3, 12)).toContain('nur 3 von 12 Buchungen')
  })
})

describe('backup/restore of finance data (real IndexedDB)', () => {
  it('round-trips all finance stores', async () => {
    await seedFinanceData()
    const backup = await createBackup()
    expect(backup.data.transactions).toHaveLength(2)

    await deleteDatabase()
    await performRestore(backup)

    expect((await transactionRepository.getAll()).map((entry) => entry.id).sort()).toEqual(['t1', 't2'])
    expect(await accountRepository.getAll()).toEqual(backup.data.accounts)
    expect(await importBatchRepository.getAll()).toEqual(backup.data.importBatches)
    expect(await categoryRuleRepository.getAll()).toHaveLength(1)
    expect((await savingsGoalRepository.getAll())[0]?.monthlyTarget).toBe(600)
  })

  it('restores a release-1.1 backup: finance stores empty, all default categories present', async () => {
    await seedFinanceData()
    await performRestore(releaseOneOneBackup())

    expect(await transactionRepository.getAll()).toEqual([])
    expect(await accountRepository.getAll()).toEqual([])
    const categoryIds = (await categoryRepository.getAll()).map((category) => category.id).sort()
    expect(categoryIds).toEqual(DEFAULT_CATEGORIES.map((category) => category.id).sort())
  })

  it('changes nothing when a booking in the backup breaks the unique index', async () => {
    await seedFinanceData()
    const backup = await createBackup()
    const broken: KostenblickBackup = {
      ...backup,
      data: { ...backup.data, transactions: [transaction('x1', { dedupeKey: 'same' }), transaction('x2', { dedupeKey: 'same' })] },
    }

    await expect(performRestore(broken)).rejects.toBeTruthy()
    expect((await transactionRepository.getAll()).map((entry) => entry.id).sort()).toEqual(['t1', 't2'])
  })
})

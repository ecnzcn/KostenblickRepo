import { describe, expect, it } from 'vitest'
import { DATABASE_VERSION } from '../database/schema'
import { buildBackup, type KostenblickBackupData } from '../domain/usecases/backup'
import {
  checkBackupCompatibility,
  evaluateBackupFile,
  getBackupSummary,
  validateBackupReferences,
} from '../domain/usecases/restore'

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
}

function bill(overrides: Partial<KostenblickBackupData['bills'][number]> = {}) {
  return {
    id: 'bill-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    userId: 'local-user',
    type: 'utility' as const,
    year: 2026,
    totalAmount: 100,
    advancePayments: 0,
    balance: 0,
    balanceType: 'none' as const,
    ...overrides,
  }
}

describe('getBackupSummary', () => {
  it('reports exportedAt/appVersion/databaseVersion and counts per store', () => {
    const backup = buildBackup(
      { ...emptyData, bills: [bill()], contracts: [], documentFiles: [{ id: 'f1', mimeType: 'application/pdf', base64: 'YQ==' }] },
      new Date('2026-09-26T12:00:00.000Z'),
    )
    const summary = getBackupSummary(backup)

    expect(summary.exportedAt).toBe('2026-09-26T12:00:00.000Z')
    expect(summary.databaseVersion).toBe(DATABASE_VERSION)
    expect(summary.counts.bills).toBe(1)
    expect(summary.counts.documentFiles).toBe(1)
    expect(summary.counts.contracts).toBe(0)
  })
})

describe('checkBackupCompatibility', () => {
  it('accepts a backup matching the current formatVersion and databaseVersion', () => {
    expect(checkBackupCompatibility(buildBackup(emptyData))).toEqual([])
  })

  it('rejects an unsupported formatVersion with the required message', () => {
    const backup = { ...buildBackup(emptyData), formatVersion: 999 }
    expect(checkBackupCompatibility(backup)).toContain(
      'Dieses Backupformat wird von dieser Version von Kostenblick nicht unterstützt.',
    )
  })

  it('rejects an incompatible databaseVersion', () => {
    const backup = { ...buildBackup(emptyData), databaseVersion: DATABASE_VERSION + 1 }
    const errors = checkBackupCompatibility(backup)
    expect(errors.some((e) => e.includes('Datenbankversion'))).toBe(true)
  })
})

describe('validateBackupReferences', () => {
  it('accepts an internally consistent dataset', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      bills: [bill()],
      billItems: [
        {
          id: 'item-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          billId: 'bill-1',
          description: 'Heizung',
          amount: 50,
          confidence: 1,
          manuallyVerified: true,
        },
      ],
    }
    expect(validateBackupReferences(data)).toEqual([])
  })

  it('flags a BillItem referencing a Bill that does not exist', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      billItems: [
        {
          id: 'item-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          billId: 'missing-bill',
          description: 'Heizung',
          amount: 50,
          confidence: 1,
          manuallyVerified: true,
        },
      ],
    }
    expect(validateBackupReferences(data).some((e) => e.includes('item-1'))).toBe(true)
  })

  it('flags a Reminder referencing a Contract that does not exist', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      reminders: [
        {
          id: 'rem-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          userId: 'local-user',
          contractId: 'missing-contract',
          reminderDate: '2026-02-01T00:00:00.000Z',
          type: 'cancellation',
          status: 'pending',
        },
      ],
    }
    expect(validateBackupReferences(data).some((e) => e.includes('rem-1'))).toBe(true)
  })

  it('flags a Bill referencing a Document that does not exist', () => {
    const data: KostenblickBackupData = { ...emptyData, bills: [bill({ documentId: 'missing-doc' })] }
    expect(validateBackupReferences(data).some((e) => e.includes('bill-1'))).toBe(true)
  })

  it('does NOT flag a Document without a matching documentFiles entry - an accepted, existing data state', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      documents: [
        {
          id: 'doc-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          userId: 'local-user',
          type: 'other',
          filename: 'verwaist.pdf',
          mimeType: 'application/pdf',
          size: 0,
          storagePath: 'does-not-exist',
          ocrStatus: 'not_started',
        },
      ],
    }
    expect(validateBackupReferences(data)).toEqual([])
  })
})

describe('evaluateBackupFile', () => {
  it('rejects text that is not valid JSON', () => {
    const result = evaluateBackupFile('{ this is not json')
    expect(result.status).toBe('invalid_json')
  })

  it('rejects valid JSON that is not a Kostenblick backup', () => {
    const result = evaluateBackupFile(JSON.stringify({ hello: 'world' }))
    expect(result.status).toBe('invalid_structure')
  })

  it('rejects a structurally valid backup with an unsupported formatVersion', () => {
    const backup = { ...buildBackup(emptyData), formatVersion: 999 }
    const result = evaluateBackupFile(JSON.stringify(backup))
    expect(result.status).toBe('incompatible')
  })

  it('rejects a structurally valid, compatible backup with broken references', () => {
    const backup = buildBackup({
      ...emptyData,
      billItems: [
        {
          id: 'item-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          billId: 'missing-bill',
          description: 'x',
          amount: 1,
          confidence: 1,
          manuallyVerified: true,
        },
      ],
    })
    const result = evaluateBackupFile(JSON.stringify(backup))
    expect(result.status).toBe('invalid_references')
  })

  it('accepts a well-formed, compatible, internally consistent backup', () => {
    const backup = buildBackup({ ...emptyData, bills: [bill()] })
    const result = evaluateBackupFile(JSON.stringify(backup))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.summary.counts.bills).toBe(1)
      expect(result.backup.data.bills[0]?.id).toBe('bill-1')
    }
  })
})

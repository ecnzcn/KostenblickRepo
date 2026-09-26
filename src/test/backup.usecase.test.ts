import { describe, expect, it } from 'vitest'
import { DATABASE_VERSION } from '../database/schema'
import { APP_VERSION } from '../constants/appVersion'
import { BACKUP_FORMAT_VERSION, buildBackup, validateBackup, type KostenblickBackupData } from '../domain/usecases/backup'

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

describe('buildBackup', () => {
  it('stamps formatVersion, appVersion and databaseVersion from the app itself, not a duplicated literal', () => {
    const backup = buildBackup(emptyData, new Date('2026-09-26T12:00:00.000Z'))

    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION)
    expect(backup.appVersion).toBe(APP_VERSION)
    expect(backup.databaseVersion).toBe(DATABASE_VERSION)
    expect(backup.exportedAt).toBe('2026-09-26T12:00:00.000Z')
  })

  it('includes every expected data section, even when everything is empty', () => {
    const backup = buildBackup(emptyData)

    expect(backup.data).toEqual(emptyData)
    expect(Object.keys(backup.data).sort()).toEqual(
      [
        'bills',
        'billItems',
        'categories',
        'contracts',
        'costEntries',
        'documentFiles',
        'documents',
        'properties',
        'reminders',
        'syncQueue',
        'users',
        'wasteCosts',
      ].sort(),
    )
  })

  it('carries through actual records unchanged, including their ids', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      contracts: [
        {
          id: 'c1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          userId: 'local-user',
          categoryId: 'internet',
          provider: 'Telekom',
          monthlyCost: 40,
          startDate: '2026-01-01T00:00:00.000Z',
          autoRenewal: true,
          reminderEnabled: true,
        },
      ],
    }

    const backup = buildBackup(data)
    expect(backup.data.contracts).toEqual(data.contracts)
  })

  it('includes a soft-deleted record exactly as stored, without dropping or altering it', () => {
    const data: KostenblickBackupData = {
      ...emptyData,
      wasteCosts: [
        {
          id: 'w1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          deletedAt: '2026-02-01T00:00:00.000Z',
          syncVersion: 2,
          userId: 'local-user',
          year: 2026,
          category: 'residual',
          amount: 92,
        },
      ],
    }

    const backup = buildBackup(data)
    expect(backup.data.wasteCosts[0]?.deletedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(backup.data.wasteCosts[0]?.syncVersion).toBe(2)
  })
})

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    expect(validateBackup(buildBackup(emptyData))).toEqual([])
  })

  it('rejects a non-object', () => {
    expect(validateBackup(null)).not.toEqual([])
    expect(validateBackup('not a backup')).not.toEqual([])
  })

  it('flags a missing formatVersion', () => {
    const backup = buildBackup(emptyData)
    const { formatVersion: _formatVersion, ...rest } = backup
    expect(validateBackup(rest)).toContain('formatVersion fehlt oder ist ungültig.')
  })

  it('flags a missing appVersion', () => {
    const backup = buildBackup(emptyData)
    const broken = { ...backup, appVersion: '' }
    expect(validateBackup(broken)).toContain('appVersion fehlt.')
  })

  it('flags a data section that is not an array', () => {
    const backup = buildBackup(emptyData)
    const broken = { ...backup, data: { ...backup.data, bills: 'not-an-array' } }
    expect(validateBackup(broken)).toContain('data.bills fehlt oder ist kein Array.')
  })

  it('flags an incomplete documentFiles entry', () => {
    const backup = buildBackup(emptyData)
    const broken = { ...backup, data: { ...backup.data, documentFiles: [{ id: 'd1' }] } }
    expect(validateBackup(broken).some((error) => error.includes('documentFiles-Eintrag d1'))).toBe(true)
  })

  it('flags a missing data section entirely', () => {
    const backup = buildBackup(emptyData)
    const { data: _data, ...rest } = backup
    expect(validateBackup(rest)).toContain('data fehlt.')
  })
})

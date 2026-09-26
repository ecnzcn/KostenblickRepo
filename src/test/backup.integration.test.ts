// Runs under the Node environment rather than jsdom, for the same reason
// as documentStorage.test.ts/documentLifecycle.usecase.test.ts: this file
// exercises real documentFiles/Blob round-trips through fake-indexeddb,
// which jsdom's Blob/File cannot survive.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import { documentRepository, wasteCostRepository } from '../domain/repositories/indexedDbRepositories'
import { createBackup, validateBackup } from '../domain/usecases/backup'
import { createContract } from '../domain/usecases/contracts'
import { saveDocumentFile } from '../domain/usecases/documents'
import { generateId } from '../utils/id'
import { base64ToBlob } from '../utils/base64'

beforeEach(async () => {
  await deleteDatabase()
})

function makeFile(name: string, type: string, content: string): File {
  return new File([content], name, { type })
}

describe('createBackup (real IndexedDB)', () => {
  it('produces a valid, empty backup for a genuinely empty database', async () => {
    const backup = await createBackup()

    expect(validateBackup(backup)).toEqual([])
    expect(backup.data.bills).toEqual([])
    expect(backup.data.contracts).toEqual([])
    expect(backup.data.documents).toEqual([])
    expect(backup.data.documentFiles).toEqual([])
    // Categories are seeded on first database access - not "empty" the
    // same way soft-deletable stores are, but still a real, checkable array.
    expect(Array.isArray(backup.data.categories)).toBe(true)
  })

  it('exports multiple records across different entity types with their ids intact', async () => {
    const contract = await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      cancellationPeriodValue: 3,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })
    const waste = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 92,
    })

    const backup = await createBackup()

    expect(backup.data.contracts.map((c) => c.id)).toContain(contract.id)
    expect(backup.data.wasteCosts.map((w) => w.id)).toContain(waste.id)
    // The reminders createContract() generates as a side effect are real,
    // persisted records too - a full backup includes them.
    expect(backup.data.reminders.length).toBeGreaterThan(0)
  })

  it('includes a soft-deleted record, not just active ones', async () => {
    const waste = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'organic',
      amount: 38.4,
    })
    await wasteCostRepository.delete(waste.id)

    const backup = await createBackup()
    const exported = backup.data.wasteCosts.find((w) => w.id === waste.id)

    expect(exported).toBeDefined()
    expect(exported?.deletedAt).not.toBeNull()
  })

  it('serializes a document and its binary file content losslessly', async () => {
    const content = 'echter PDF-Inhalt, nicht wirklich, aber Bytes genug'
    const document = await saveDocumentFile(makeFile('rechnung.pdf', 'application/pdf', content), 'bill')

    const backup = await createBackup()

    const exportedDocument = backup.data.documents.find((d) => d.id === document.id)
    expect(exportedDocument).toBeDefined()
    expect(exportedDocument?.filename).toBe('rechnung.pdf')

    const exportedFile = backup.data.documentFiles.find((f) => f.id === document.storagePath)
    expect(exportedFile).toBeDefined()
    expect(exportedFile?.mimeType).toBe('application/pdf')

    const restoredBlob = base64ToBlob(exportedFile!.base64, exportedFile!.mimeType)
    expect(await restoredBlob.text()).toBe(content)
  })

  it('does not crash when a Document entity exists without a matching documentFiles blob', async () => {
    // Simulates a data-integrity edge case (e.g. a partial write) rather
    // than a normal app flow - saveDocumentFile() always creates both
    // together, so this bypasses it on purpose to prove the export never
    // assumes the two are always paired.
    const orphanDocument = await documentRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      type: 'other',
      filename: 'verwaist.pdf',
      mimeType: 'application/pdf',
      size: 0,
      storagePath: 'does-not-exist-in-documentFiles',
      ocrStatus: 'not_started',
    })

    const backup = await createBackup()

    expect(validateBackup(backup)).toEqual([])
    expect(backup.data.documents.map((d) => d.id)).toContain(orphanDocument.id)
    expect(backup.data.documentFiles.some((f) => f.id === orphanDocument.storagePath)).toBe(false)
  })

  it('serializes a long filename and non-ASCII content without loss', async () => {
    const longName = `${'a'.repeat(150)}-gebuehrenbescheid-müllabfuhr.pdf`
    const content = 'Sonderzeichen: äöüß € — inhalt'
    const document = await saveDocumentFile(makeFile(longName, 'application/pdf', content), 'waste')

    const backup = await createBackup()

    expect(backup.data.documents.find((d) => d.id === document.id)?.filename).toBe(longName)
    const exportedFile = backup.data.documentFiles.find((f) => f.id === document.storagePath)
    const restored = base64ToBlob(exportedFile!.base64, exportedFile!.mimeType)
    expect(await restored.text()).toBe(content)
  })
})

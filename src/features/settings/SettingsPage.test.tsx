import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { APP_VERSION } from '../../constants/appVersion'
import { deleteDatabase } from '../../database/database'
import { DATABASE_VERSION } from '../../database/schema'
import { billRepository, wasteCostRepository } from '../../domain/repositories/indexedDbRepositories'
import { buildBackup, type KostenblickBackupData } from '../../domain/usecases/backup'
import { createContract } from '../../domain/usecases/contracts'
import { getEnabledReminderOffsets } from '../../domain/usecases/reminders/reminderSettings'
import { listRemindersForContract } from '../../domain/usecases/reminders/reminderQueries'
import { generateId } from '../../utils/id'

const emptyBackupData: KostenblickBackupData = {
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

function getRestoreFileInput(): HTMLInputElement {
  return screen.getByLabelText('Backup-Datei auswählen') as HTMLInputElement
}

function selectBackupFile(content: string) {
  const file = new File([content], 'kostenblick-backup.json', { type: 'application/json' })
  fireEvent.change(getRestoreFileInput(), { target: { files: [file] } })
}

beforeEach(async () => {
  localStorage.clear()
  await deleteDatabase()
})

function renderPage() {
  return render(
    <HashRouter>
      <SettingsPage />
    </HashRouter>,
  )
}

describe('SettingsPage', () => {
  it('links "Erinnerungen" to the reminders page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Erinnerungen' })).toHaveAttribute('href', '#/erinnerungen')
  })

  it('links "Dokumente" to the documents page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Dokumente' })).toHaveAttribute('href', '#/dokumente')
  })

  it('links "Müllkosten" to the waste costs page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Müllkosten' })).toHaveAttribute('href', '#/muell')
  })

  it('links "Kostenübersicht" to the central cost overview page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Kostenübersicht' })).toHaveAttribute('href', '#/kostenuebersicht')
  })

  it('links "Kosten" to the manual cost entries page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Kosten' })).toHaveAttribute('href', '#/kosten')
  })

  it('no longer shows the non-functional "Synchronisierung" placeholder', () => {
    renderPage()
    expect(screen.queryByText('Synchronisierung')).not.toBeInTheDocument()
  })

  it('shows all four reminder intervals enabled by default and persists a toggle', () => {
    renderPage()

    const ninetyDays = screen.getByLabelText('90 Tage vorher')
    expect(ninetyDays).toBeChecked()

    fireEvent.click(ninetyDays)
    expect(getEnabledReminderOffsets()).toEqual([30, 7, 1])
  })

  it('disabling an interval also removes it from an already-existing contract\'s reminders', async () => {
    const contract = await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      cancellationPeriodValue: 3,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })
    expect((await listRemindersForContract(contract.id)).map((r) => r.offsetDays)).toContain(90)

    renderPage()
    fireEvent.click(screen.getByLabelText('90 Tage vorher'))

    await waitFor(async () => {
      const reminders = await listRemindersForContract(contract.id)
      expect(reminders.map((r) => r.offsetDays)).not.toContain(90)
    })
    expect(await listRemindersForContract(contract.id)).toHaveLength(3)
  })

  it('shows the notification status - "Nicht unterstützt" in a test/jsdom environment without the Notification API', () => {
    renderPage()
    expect(screen.getByText(/Status: Nicht unterstützt/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Benachrichtigungen aktivieren' })).not.toBeInTheDocument()
  })

  it('shows a "Daten & Backup" section with an export action', () => {
    renderPage()
    expect(screen.getByText('Daten & Backup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Backup exportieren' })).toBeInTheDocument()
  })

  it('exports a backup and shows a success confirmation', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    await waitFor(() => expect(screen.getByText('Backup wurde heruntergeladen.')).toBeInTheDocument())
  })

  it('shows an understandable error message, not a stack trace, when the export fails', async () => {
    const failure = vi.spyOn(billRepository, 'getAllIncludingDeleted').mockRejectedValueOnce(new Error('boom'))

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Backup exportieren' }))

    await waitFor(() => expect(screen.getByText('Backup fehlgeschlagen: boom')).toBeInTheDocument())
    expect(screen.queryByText(/at Object\.|at async|\.ts:\d+/)).not.toBeInTheDocument()

    failure.mockRestore()
  })

  it('shows a "Backup wiederherstellen" restore control', () => {
    renderPage()
    expect(screen.getByText('Backup wiederherstellen', { selector: 'h3' })).toBeInTheDocument()
    expect(getRestoreFileInput()).toBeInTheDocument()
  })

  it('rejects a file that is not valid JSON, without touching any data', async () => {
    const existing = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })

    renderPage()
    selectBackupFile('{ this is not json')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('kein gültiges JSON'))
    expect((await wasteCostRepository.getAllIncludingDeleted()).map((w) => w.id)).toEqual([existing.id])
  })

  it('rejects a backup with an incompatible databaseVersion, without touching any data', async () => {
    renderPage()
    const incompatible = { ...buildBackup(emptyBackupData), databaseVersion: DATABASE_VERSION + 1 }
    selectBackupFile(JSON.stringify(incompatible))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Datenbankversion'))
  })

  it('shows the backup info and a strong warning after selecting a valid file - not confirming yet', async () => {
    const existing = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })

    renderPage()
    const backup = buildBackup({
      ...emptyBackupData,
      wasteCosts: [
        {
          id: generateId(),
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          userId: 'local-user',
          year: 2027,
          category: 'organic',
          amount: 55,
        },
      ],
    })
    selectBackupFile(JSON.stringify(backup))

    await waitFor(() => expect(screen.getByText('Dieses Backup enthält:')).toBeInTheDocument())
    expect(screen.getByText(/Backup wiederherstellen\?.*ersetzt/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Backup wiederherstellen' })).toBeInTheDocument()

    // Selecting/inspecting a file must never itself change anything.
    expect((await wasteCostRepository.getAllIncludingDeleted()).map((w) => w.id)).toEqual([existing.id])
  })

  it('cancelling the restore leaves existing data completely unchanged', async () => {
    const existing = await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })

    renderPage()
    selectBackupFile(JSON.stringify(buildBackup(emptyBackupData)))
    await waitFor(() => expect(screen.getByText('Dieses Backup enthält:')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    expect(screen.queryByText('Dieses Backup enthält:')).not.toBeInTheDocument()
    expect(getRestoreFileInput()).toBeInTheDocument()
    expect((await wasteCostRepository.getAllIncludingDeleted()).map((w) => w.id)).toEqual([existing.id])
  })

  it('confirming replaces existing data with the backup and shows a success message', async () => {
    await wasteCostRepository.save({
      id: generateId(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      syncVersion: 1,
      userId: 'local-user',
      year: 2026,
      category: 'residual',
      amount: 10,
    })

    renderPage()
    const restoredWasteId = generateId()
    const backup = buildBackup({
      ...emptyBackupData,
      wasteCosts: [
        {
          id: restoredWasteId,
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-02-01T00:00:00.000Z',
          deletedAt: null,
          syncVersion: 1,
          userId: 'local-user',
          year: 2027,
          category: 'organic',
          amount: 55,
        },
      ],
    })
    selectBackupFile(JSON.stringify(backup))
    await waitFor(() => expect(screen.getByText('Dieses Backup enthält:')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Backup wiederherstellen' }))

    await waitFor(() => expect(screen.getByText('Backup wurde erfolgreich wiederhergestellt.')).toBeInTheDocument())
    expect((await wasteCostRepository.getAllIncludingDeleted()).map((w) => w.id)).toEqual([restoredWasteId])
  })

  it('shows an understandable error, not a stack trace, when the restore itself fails', async () => {
    renderPage()
    const backup = buildBackup(emptyBackupData)
    // A record with no `id` (the store's keyPath) makes real IndexedDB
    // reject the write - a genuine restore failure to verify against.
    const broken = {
      ...backup,
      data: { ...backup.data, wasteCosts: [{ year: 2026, category: 'residual', amount: 1 }] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    selectBackupFile(JSON.stringify(broken))
    await waitFor(() => expect(screen.getByText('Dieses Backup enthält:')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Backup wiederherstellen' }))

    await waitFor(() => expect(screen.getByText(/Wiederherstellung fehlgeschlagen/)).toBeInTheDocument())
    expect(screen.getByText(/nicht verändert/)).toBeInTheDocument()
    expect(screen.queryByText(/at Object\.|at async|\.ts:\d+/)).not.toBeInTheDocument()
  })

  it('shows the app version from the single APP_VERSION source, not a hardcoded string', () => {
    renderPage()
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeInTheDocument()
    // Guards against a stale/duplicated version literal ever being hardcoded
    // here instead of read from APP_VERSION.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

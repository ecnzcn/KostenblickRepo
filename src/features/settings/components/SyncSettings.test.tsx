import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncSettings } from './SyncSettings'
import { deleteDatabase } from '../../../database/database'
import { contractRepository } from '../../../domain/repositories/indexedDbRepositories'
import { getCurrentOwnerId, getHouseholdMembership, saveSyncServerConfig } from '../../../services/sync/syncSettings'

const account = vi.hoisted(() => ({
  getSignedInEmail: vi.fn<() => Promise<string | undefined>>(),
  requestLoginCode: vi.fn<(email: string) => Promise<void>>(),
  verifyLoginCode: vi.fn<(email: string, code: string) => Promise<void>>(),
  listMyHouseholds: vi.fn<() => Promise<Array<{ id: string; name: string }>>>(),
  createHousehold: vi.fn<(name: string) => Promise<{ id: string; name: string }>>(),
  createInviteCode: vi.fn<(id: string) => Promise<string>>(),
  joinHousehold: vi.fn<(code: string) => Promise<{ id: string; name: string }>>(),
  signOut: vi.fn<() => Promise<void>>(),
}))
vi.mock('../../../services/sync/accountService', () => account)

const sync = vi.hoisted(() => ({ runSync: vi.fn(), handleLocalDataRestored: vi.fn() }))
vi.mock('../../../services/sync/syncService', () => sync)

beforeEach(async () => {
  localStorage.clear()
  await deleteDatabase()
  vi.clearAllMocks()
  sync.runSync.mockResolvedValue({ kind: 'success', result: { pushed: 1, pulled: 0, conflicts: [], cursor: 1 } })
})

function configure() {
  saveSyncServerConfig({ url: 'https://abc.supabase.co', anonKey: 'x'.repeat(40) })
}

describe('SyncSettings', () => {
  it('asks for the server first and rejects incomplete input', async () => {
    render(<SyncSettings />)
    expect(await screen.findByLabelText('Project URL')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Project URL'), { target: { value: 'https://abc.supabase.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Server speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent('https-Adresse')
  })

  it('moves on to the e-mail login once the server is saved', async () => {
    account.getSignedInEmail.mockResolvedValue(undefined)
    render(<SyncSettings />)
    fireEvent.change(await screen.findByLabelText('Project URL'), { target: { value: 'https://abc.supabase.co' } })
    fireEvent.change(screen.getByLabelText('Anon- bzw. Publishable-Key'), { target: { value: 'k'.repeat(40) } })
    fireEvent.click(screen.getByRole('button', { name: 'Server speichern' }))
    expect(await screen.findByLabelText('E-Mail-Adresse')).toBeInTheDocument()
  })

  it('logs in with an e-mail code', async () => {
    configure()
    account.getSignedInEmail.mockResolvedValueOnce(undefined).mockResolvedValue('ercan@example.com')
    account.listMyHouseholds.mockResolvedValue([])
    account.requestLoginCode.mockResolvedValue()
    account.verifyLoginCode.mockResolvedValue()
    render(<SyncSettings />)

    fireEvent.change(await screen.findByLabelText('E-Mail-Adresse'), { target: { value: 'ercan@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Code senden' }))
    fireEvent.change(await screen.findByLabelText('Code aus der E-Mail'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect(account.verifyLoginCode).toHaveBeenCalledWith('ercan@example.com', '123456')
    expect(await screen.findByRole('button', { name: 'Haushalt anlegen' })).toBeInTheDocument()
  })

  it('creates a household only after confirming that local data is handed over', async () => {
    configure()
    account.getSignedInEmail.mockResolvedValue('ercan@example.com')
    account.listMyHouseholds.mockResolvedValue([])
    account.createHousehold.mockResolvedValue({ id: 'hh-1', name: 'Familie Z' })
    await contractRepository.save({
      id: 'c1', createdAt: '', updatedAt: '', deletedAt: null, syncVersion: 0, userId: 'local-user',
      categoryId: 'internet', provider: 'Telekom', monthlyCost: 40, startDate: '2026-01-01T00:00:00.000Z',
      autoRenewal: true, reminderEnabled: false,
    })
    render(<SyncSettings />)

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Familie Z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Haushalt anlegen' }))
    expect(await screen.findByText(/1 Einträge gespeichert/)).toBeInTheDocument()
    expect(account.createHousehold).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(getHouseholdMembership()?.householdId).toBe('hh-1'))
    expect(getCurrentOwnerId()).toBe('hh-1')
    expect((await contractRepository.getById('c1'))?.userId).toBe('hh-1')
    expect(sync.runSync).toHaveBeenCalled()
    expect(await screen.findByText('Familie Z')).toBeInTheDocument()
  })

  it('offers merge or replace when joining with local data, and cancelling changes nothing', async () => {
    configure()
    account.getSignedInEmail.mockResolvedValue('partner@example.com')
    account.listMyHouseholds.mockResolvedValue([])
    account.joinHousehold.mockResolvedValue({ id: 'hh-1', name: 'Familie Z' })
    await contractRepository.save({
      id: 'c1', createdAt: '', updatedAt: '', deletedAt: null, syncVersion: 0, userId: 'local-user',
      categoryId: 'internet', provider: 'Telekom', monthlyCost: 40, startDate: '2026-01-01T00:00:00.000Z',
      autoRenewal: true, reminderEnabled: false,
    })
    render(<SyncSettings />)

    fireEvent.change(await screen.findByLabelText('Einladungscode'), { target: { value: 'abcd-1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Beitreten' }))
    expect(await screen.findByRole('button', { name: 'Ersetzen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zusammenführen' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await screen.findByRole('button', { name: 'Haushalt anlegen' })
    expect(getHouseholdMembership()).toBeUndefined()
    expect((await contractRepository.getById('c1'))?.userId).toBe('local-user')
  })

  it('shows an invite code for the second person', async () => {
    configure()
    localStorage.setItem('kostenblick.sync.household.v1', JSON.stringify({ householdId: 'hh-1', householdName: 'Familie Z' }))
    account.getSignedInEmail.mockResolvedValue('ercan@example.com')
    account.createInviteCode.mockResolvedValue('AB12-CD34')
    render(<SyncSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Einladungscode erstellen' }))
    expect(await screen.findByLabelText('Einladungscode')).toHaveTextContent('AB12-CD34')
  })

  it('reports a failed manual sync in plain German', async () => {
    configure()
    localStorage.setItem('kostenblick.sync.household.v1', JSON.stringify({ householdId: 'hh-1', householdName: 'Familie Z' }))
    account.getSignedInEmail.mockResolvedValue('ercan@example.com')
    sync.runSync.mockResolvedValue({ kind: 'error', message: 'Keine Verbindung zum Server.' })
    render(<SyncSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Jetzt synchronisieren' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Keine Verbindung zum Server.')
  })
})

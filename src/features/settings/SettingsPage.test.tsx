import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { deleteDatabase } from '../../database/database'
import { billRepository } from '../../domain/repositories/indexedDbRepositories'
import { createContract } from '../../domain/usecases/contracts'
import { getEnabledReminderOffsets } from '../../domain/usecases/reminders/reminderSettings'
import { listRemindersForContract } from '../../domain/usecases/reminders/reminderQueries'

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
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { deleteDatabase } from '../../database/database'
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
})

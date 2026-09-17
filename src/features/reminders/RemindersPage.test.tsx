import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createContract } from '../../domain/usecases/contracts'
import { ContractDetailPage } from '../contracts/ContractDetailPage'
import { RemindersPage } from './RemindersPage'

beforeEach(async () => {
  await deleteDatabase()
  localStorage.clear()
})

function renderRemindersApp() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/erinnerungen']}>
        <Routes>
          <Route path="/erinnerungen" element={<RemindersPage />} />
          <Route path="/vertraege/:id" element={<ContractDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

describe('RemindersPage', () => {
  it('shows the empty state when there are no contracts at all', async () => {
    renderRemindersApp()
    await waitForLoadingToFinish()
    expect(
      screen.getByText('Keine anstehenden Erinnerungen. Aktuell gibt es keine fälligen Vertragsfristen.'),
    ).toBeInTheDocument()
  })

  it('groups an upcoming reminder under "Später" and shows its contract details', async () => {
    // Far enough in the future that all 4 default reminders land beyond 7 days out.
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      tariff: 'MagentaZuhause L',
      monthlyCost: 49.99,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2027-06-01T00:00:00.000Z',
      cancellationPeriodValue: 1,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderRemindersApp()
    await waitForLoadingToFinish()

    expect(screen.getByText('Später')).toBeInTheDocument()
    expect(screen.getAllByText('Telekom').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MagentaZuhause L').length).toBeGreaterThan(0)
  })

  it('marks a reminder as done and removes it from the list', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 49.99,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2027-06-01T00:00:00.000Z',
      cancellationPeriodValue: 1,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderRemindersApp()
    await waitForLoadingToFinish()

    const dismissButtons = screen.getAllByRole('button', { name: 'Als erledigt markieren' })
    const countBefore = dismissButtons.length
    fireEvent.click(dismissButtons[0]!)

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Als erledigt markieren' })).toHaveLength(countBefore - 1),
    )
  })

  it('links a reminder to its contract detail page', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 49.99,
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2027-06-01T00:00:00.000Z',
      cancellationPeriodValue: 1,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderRemindersApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getAllByRole('link', { name: 'Vertrag öffnen' })[0]!)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Telekom' })).toBeInTheDocument())
  })
})

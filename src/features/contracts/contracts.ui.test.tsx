import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createContract, listContracts } from '../../domain/usecases/contracts'
import { ContractFormPage } from './ContractFormPage'
import { ContractsPage } from './ContractsPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderContractsApp(initialPath = '/vertraege') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/vertraege" element={<ContractsPage />} />
          <Route path="/vertraege/neu" element={<ContractFormPage mode="create" />} />
          <Route path="/vertraege/:id/bearbeiten" element={<ContractFormPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

describe('ContractsPage', () => {
  it('shows the empty state with a call to action when there is no data', async () => {
    renderContractsApp()
    await waitForLoadingToFinish()
    expect(screen.getByText('Noch keine Verträge vorhanden.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Vertrag hinzufügen' })).toBeInTheDocument()
  })

  it('lists contracts sorted by soonest cancellation deadline first', async () => {
    await createContract({
      categoryId: 'electricity',
      provider: 'E.ON',
      monthlyCost: 89,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2026-12-31T00:00:00.000Z',
      cancellationPeriodValue: 1,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2026-10-31T00:00:00.000Z',
      cancellationPeriodValue: 1,
      cancellationPeriodUnit: 'months',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    const providers = screen.getAllByText(/Telekom|E\.ON/).map((el) => el.textContent)
    expect(providers[0]).toBe('Telekom')
    expect(providers[1]).toBe('E.ON')
  })

  it('deletes a contract after confirmation', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderContractsApp()
    await waitForLoadingToFinish()
    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(async () => expect(await listContracts()).toHaveLength(0))
    confirmSpy.mockRestore()
  })
})

describe('ContractFormPage (create)', () => {
  it('shows validation errors instead of saving when required fields are missing', async () => {
    renderContractsApp('/vertraege/neu')
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Anbieter darf nicht leer sein.')
    expect(await listContracts()).toHaveLength(0)
  })

  it('shows the calculated cancellation date preview and saves it', async () => {
    renderContractsApp('/vertraege/neu')
    await screen.findByRole('option', { name: /Internet/ })

    fireEvent.change(screen.getByLabelText('Anbieter'), { target: { value: 'Telekom' } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'internet' } })
    fireEvent.change(screen.getByLabelText('Monatliche Kosten'), { target: { value: '49,99' } })
    fireEvent.change(screen.getByLabelText('Vertragsbeginn'), { target: { value: '2025-01-01' } })
    fireEvent.change(screen.getByLabelText(/Vertragsende/), { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByLabelText(/^Kündigungsfrist/), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/Einheit/), { target: { value: 'months' } })

    expect(await screen.findByText(/Kündigung spätestens am/)).toHaveTextContent('30.09.2026')

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Verträge' })).toBeInTheDocument())

    const contracts = await listContracts()
    expect(contracts).toHaveLength(1)
    expect(contracts[0]?.yearlyCost).toBe(599.88)
    expect(contracts[0]?.calculatedCancellationDate).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('ContractFormPage (edit)', () => {
  it('prefills existing values and updates the same record', async () => {
    const created = await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp(`/vertraege/${created.id}/bearbeiten`)
    await waitForLoadingToFinish()
    await screen.findByRole('option', { name: /Internet/ })

    expect(screen.getByLabelText('Anbieter')).toHaveValue('Telekom')

    fireEvent.change(screen.getByLabelText('Monatliche Kosten'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const contracts = await listContracts()
      expect(contracts).toHaveLength(1)
      expect(contracts[0]?.monthlyCost).toBe(45)
    })
  })
})

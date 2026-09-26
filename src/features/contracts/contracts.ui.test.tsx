import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createContract, listContracts } from '../../domain/usecases/contracts'
import { ContractDetailPage } from './ContractDetailPage'
import { ContractFormPage } from './ContractFormPage'
import { ContractsPage } from './ContractsPage'
import { DocumentDetailPage } from '../documents/DocumentDetailPage'

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
          <Route path="/vertraege/:id" element={<ContractDetailPage />} />
          <Route path="/dokumente/:id" element={<DocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

/** ISO date `daysFromNow` days from the real current time - keeps
 * date-dependent fixtures (e.g. contract status) correct regardless of
 * which day the suite actually runs on. */
function isoDaysFromNow(daysFromNow: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString()
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

  it('shows the computed contract status next to each contract', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: isoDaysFromNow(20),
      cancellationPeriodValue: 10,
      cancellationPeriodUnit: 'days',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    expect(screen.getByText('Dringend')).toBeInTheDocument()
  })

  it('shows the contract category next to each contract in the list', async () => {
    await createContract({
      categoryId: 'electricity',
      provider: 'E.ON',
      monthlyCost: 89,
      startDate: '2024-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    // Scoped to the list itself - the new category filter (Phase 12D) adds
    // its own "Strom" <option>, so an unscoped query would now match twice.
    expect(within(screen.getByRole('list')).getByText('Strom')).toBeInTheDocument()
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

  it('filters contracts by search text (provider, tariff, category)', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      tariff: 'MagentaZuhause XL',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'magenta' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Telekom')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'strom' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('EnBW')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'does-not-exist' } })
    expect(screen.getByText('Keine Verträge gefunden. Passe deine Suche oder Filter an.')).toBeInTheDocument()
  })

  it('filters contracts by status (active/inactive), using the existing isContractActive() definition', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Aktiv GmbH',
      monthlyCost: 10,
      startDate: '2020-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Beendet AG',
      monthlyCost: 10,
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: '2021-01-01T00:00:00.000Z',
      autoRenewal: false,
      reminderEnabled: false,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Aktiv GmbH')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Beendet AG')).toBeInTheDocument()
  })

  it('filters contracts by category', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'electricity' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('EnBW')).toBeInTheDocument()
  })

  it('filters contracts by reminder status', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Erinnert GmbH',
      monthlyCost: 10,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Stumm AG',
      monthlyCost: 10,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: false,
      reminderEnabled: false,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Erinnerung'), { target: { value: 'disabled' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Stumm AG')).toBeInTheDocument()
  })

  it('sorts contracts by monthly cost when a different sort option is chosen', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Teuer AG',
      monthlyCost: 100,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Günstig GmbH',
      monthlyCost: 10,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Sortierung'), { target: { value: 'monthly_cost_asc' } })

    const providers = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    expect(providers[0]).toContain('Günstig GmbH')
    expect(providers[1]).toContain('Teuer AG')
  })

  it('combines search, filter and sort at once', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom Mobil',
      monthlyCost: 30,
      startDate: '2020-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom Festnetz',
      monthlyCost: 15,
      startDate: '2020-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom Kabel',
      monthlyCost: 5,
      startDate: '2020-01-01T00:00:00.000Z',
      autoRenewal: false,
      reminderEnabled: false,
    })
    await createContract({
      categoryId: 'electricity',
      provider: 'Telekom Energie',
      monthlyCost: 1,
      startDate: '2020-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'telekom' } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'internet' } })
    fireEvent.change(screen.getByLabelText('Erinnerung'), { target: { value: 'enabled' } })
    fireEvent.change(screen.getByLabelText('Sortierung'), { target: { value: 'monthly_cost_asc' } })

    const providers = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    expect(providers).toHaveLength(2)
    expect(providers[0]).toContain('Telekom Festnetz')
    expect(providers[1]).toContain('Telekom Mobil')
  })

  it('resets all filters and the search text back to "Alle" with one action', async () => {
    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })
    await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()

    const resetButton = screen.getByRole('button', { name: 'Filter zurücksetzen' })
    expect(resetButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'telekom' } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'internet' } })
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
    expect(resetButton).not.toBeDisabled()

    fireEvent.click(resetButton)

    expect(screen.getByLabelText('Verträge durchsuchen')).toHaveValue('')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
    expect(resetButton).toBeDisabled()
  })

  it('distinguishes "no contracts at all" from "no contracts match the current search/filters"', async () => {
    const firstRender = renderContractsApp()
    await waitForLoadingToFinish()
    expect(screen.getByText('Noch keine Verträge vorhanden.')).toBeInTheDocument()
    firstRender.unmount()

    await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp()
    await waitForLoadingToFinish()
    fireEvent.change(screen.getByLabelText('Verträge durchsuchen'), { target: { value: 'nichts-passt' } })
    expect(screen.getByText('Keine Verträge gefunden. Passe deine Suche oder Filter an.')).toBeInTheDocument()
    expect(screen.queryByText('Noch keine Verträge vorhanden.')).not.toBeInTheDocument()
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

describe('ContractDetailPage commitment transparency', () => {
  it('shows the category and a note that contract costs are not part of the cost overview', async () => {
    const created = await createContract({
      categoryId: 'internet',
      provider: 'Telekom',
      monthlyCost: 40,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: true,
    })

    renderContractsApp(`/vertraege/${created.id}`)
    await waitForLoadingToFinish()

    expect(screen.getByText('Kategorie')).toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(screen.getByText('Vertraglich vereinbart - nicht in der Kostenübersicht enthalten.')).toBeInTheDocument()
  })
})

describe('ContractDetailPage document attachment', () => {
  it('uploads a contract document and shows it afterwards', async () => {
    const created = await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: false,
    })

    renderContractsApp(`/vertraege/${created.id}`)
    await waitForLoadingToFinish()

    expect(screen.getByText('Vertragsdokument hochladen')).toBeInTheDocument()

    const file = new File(['content'], 'stromvertrag.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'In Dokumentenverwaltung öffnen' })).toBeInTheDocument()
  })

  it('removes a contract document, keeping the contract', async () => {
    const created = await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: false,
    })
    const { saveDocumentFile } = await import('../../domain/usecases/documents')
    const { setContractDocument } = await import('../../domain/usecases/contracts')
    const doc = await saveDocumentFile(new File(['content'], 'stromvertrag.pdf', { type: 'application/pdf' }), 'contract')
    await setContractDocument(created.id, doc.id)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderContractsApp(`/vertraege/${created.id}`)
    await waitForLoadingToFinish()

    await waitFor(() => expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Dokument löschen' }))

    await waitFor(() => expect(screen.getByText('Vertragsdokument hochladen')).toBeInTheDocument())
    const contracts = await listContracts()
    expect(contracts).toHaveLength(1)
    confirmSpy.mockRestore()
  })

  it('links to the document management page for an attached document', async () => {
    const created = await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: false,
    })
    const { saveDocumentFile } = await import('../../domain/usecases/documents')
    const { setContractDocument } = await import('../../domain/usecases/contracts')
    const doc = await saveDocumentFile(new File(['content'], 'stromvertrag.pdf', { type: 'application/pdf' }), 'contract')
    await setContractDocument(created.id, doc.id)

    renderContractsApp(`/vertraege/${created.id}`)
    await waitForLoadingToFinish()

    await waitFor(() => expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: 'In Dokumentenverwaltung öffnen' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'stromvertrag.pdf' })).toBeInTheDocument())
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createCostEntry, listCostEntries } from '../../domain/usecases/costs'
import { CostFormPage } from './CostFormPage'
import { CostsPage } from './CostsPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderCostsApp(initialPath = '/kosten') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/kosten" element={<CostsPage />} />
          <Route path="/kosten/neu" element={<CostFormPage mode="create" />} />
          <Route path="/kosten/:id/bearbeiten" element={<CostFormPage mode="edit" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  // Note: the ToastProvider's live region also has role="status" and is
  // always present, so scope this to the loading indicator's own text.
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

describe('CostsPage', () => {
  it('shows the empty state with a call to action when there is no data', async () => {
    renderCostsApp()
    await waitForLoadingToFinish()
    expect(screen.getByText(/Noch keine Kosten vorhanden/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Kosten erfassen' })).toBeInTheDocument()
  })

  it('lists previously created entries', async () => {
    await createCostEntry({ categoryId: 'heating', amount: 42, date: '2026-09-01T00:00:00.000Z' })
    renderCostsApp()
    await waitForLoadingToFinish()
    // Appears twice: once in the "Gesamt" summary, once on the list item.
    expect(screen.getAllByText('42,00 €')).toHaveLength(2)
  })

  it('shows the year filter default and scopes both the list and the total to the selected year', async () => {
    await createCostEntry({ categoryId: 'heating', amount: 100, date: '2025-03-01T00:00:00.000Z' })
    await createCostEntry({ categoryId: 'water', amount: 40, date: '2026-06-01T00:00:00.000Z' })
    await createCostEntry({ categoryId: 'water', amount: 60, date: '2026-09-01T00:00:00.000Z' })

    renderCostsApp()
    await waitForLoadingToFinish()

    // Auto-selects the most recent year with data (2026), not the current
    // calendar year, and its total is only the 2026 entries (100 €, not
    // included).
    expect(screen.getByLabelText('Jahr')).toHaveValue('2026')
    expect(screen.getByText('Gesamt 2026')).toBeInTheDocument()
    expect(screen.getAllByText('100,00 €')).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2025' } })

    await waitFor(() => expect(screen.getByText('Gesamt 2025')).toBeInTheDocument())
    // Now the list AND the total switch to 2025 - never a cross-year sum.
    expect(screen.getAllByText('100,00 €')).toHaveLength(2)
    expect(screen.queryByText('40,00 €')).not.toBeInTheDocument()
    expect(screen.queryByText('60,00 €')).not.toBeInTheDocument()
  })

  it('shows a dedicated empty state for a year with no entries, distinct from the no-data-at-all state', async () => {
    await createCostEntry({ categoryId: 'heating', amount: 100, date: '2025-03-01T00:00:00.000Z' })
    await createCostEntry({ categoryId: 'water', amount: 5, date: '2028-01-01T00:00:00.000Z' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCostsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2028' } })
    await waitFor(() => expect(screen.getByText('Gesamt 2028')).toBeInTheDocument())

    // Deleting the only 2028 entry leaves that year genuinely empty while
    // 2025 still has data - the dedicated per-year empty state must show
    // instead of falling back to the page's "no data at all" state.
    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(() => expect(screen.getByText('Keine Kosten für 2028 erfasst.')).toBeInTheDocument())
    expect(screen.getByText('Gesamt 2028')).toBeInTheDocument()
    expect(screen.getByText('0,00 €')).toBeInTheDocument()
    expect(screen.queryByText(/Noch keine Kosten vorhanden/)).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('keeps detail navigation working for an entry in the filtered list', async () => {
    const created = await createCostEntry({ categoryId: 'heating', amount: 42, date: '2026-09-01T00:00:00.000Z' })

    renderCostsApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: /bearbeiten/i }))
    await waitFor(() => expect(screen.getByLabelText('Betrag')).toHaveValue('42'))

    const entries = await listCostEntries()
    expect(entries[0]?.id).toBe(created.id)
  })

  it('deletes an entry after confirmation', async () => {
    await createCostEntry({ categoryId: 'heating', amount: 42, date: '2026-09-01T00:00:00.000Z' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderCostsApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(async () => expect(await listCostEntries()).toHaveLength(0))
    confirmSpy.mockRestore()
  })
})

describe('CostFormPage (create)', () => {
  it('shows validation errors instead of saving when required fields are missing', async () => {
    renderCostsApp('/kosten/neu')
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kategorie ist erforderlich.')
    expect(await listCostEntries()).toHaveLength(0)
  })

  it('saves a valid entry to IndexedDB and returns to the list', async () => {
    renderCostsApp('/kosten/neu')
    await screen.findByRole('option', { name: /Heizung/ })

    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'heating' } })
    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '125,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kosten' })).toBeInTheDocument())

    const entries = await listCostEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amount).toBe(125.5)
    expect(screen.getByText('Kosten gespeichert')).toBeInTheDocument()
  })
})

describe('CostFormPage (edit)', () => {
  it('prefills existing values and updates the same record', async () => {
    const created = await createCostEntry({ categoryId: 'heating', amount: 10, date: '2026-01-01T00:00:00.000Z' })

    renderCostsApp(`/kosten/${created.id}/bearbeiten`)
    await waitForLoadingToFinish()
    await screen.findByRole('option', { name: /Heizung/ })

    expect(screen.getByLabelText('Betrag')).toHaveValue('10')
    expect(screen.getByLabelText('Kategorie')).toHaveValue('heating')

    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const entries = await listCostEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0]?.amount).toBe(20)
    })
  })
})

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

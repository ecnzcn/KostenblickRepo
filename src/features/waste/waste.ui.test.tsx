import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createWasteCost, listWasteCosts } from '../../domain/usecases/wasteCosts'
import { DocumentDetailPage } from '../documents/DocumentDetailPage'
import { WasteCostDetailPage } from './WasteCostDetailPage'
import { WasteCostFormPage } from './WasteCostFormPage'
import { WasteCostsPage } from './WasteCostsPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderWasteApp(initialPath = '/muell') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/muell" element={<WasteCostsPage />} />
          <Route path="/muell/neu" element={<WasteCostFormPage mode="create" />} />
          <Route path="/muell/:id/bearbeiten" element={<WasteCostFormPage mode="edit" />} />
          <Route path="/muell/:id" element={<WasteCostDetailPage />} />
          <Route path="/dokumente/:id" element={<DocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

const CURRENT_YEAR = new Date().getUTCFullYear()

describe('WasteCostsPage', () => {
  it('shows the empty state with a call to action when there is no data', async () => {
    renderWasteApp()
    await waitForLoadingToFinish()
    expect(
      screen.getByText(/Noch keine Müllkosten erfasst\. Speichere deine Müllgebühren/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Müllkosten erfassen' })).toBeInTheDocument()
  })

  it('shows entries for the current year with correct sums grouped by category', async () => {
    await createWasteCost({ year: CURRENT_YEAR, category: 'residual', amount: 92 })
    await createWasteCost({ year: CURRENT_YEAR, category: 'organic', amount: 38.4 })

    renderWasteApp()
    await waitForLoadingToFinish()

    expect(screen.getByText('130,40 €')).toBeInTheDocument()
    expect(screen.getAllByText('Restmüll').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Biomüll').length).toBeGreaterThan(0)
    expect(screen.getAllByText('92,00 €').length).toBeGreaterThan(0)
    expect(screen.getAllByText('38,40 €').length).toBeGreaterThan(0)
  })

  it('shows an empty-year message when switching to a year without data, and the year filter works', async () => {
    await createWasteCost({ year: CURRENT_YEAR, category: 'residual', amount: 92 })

    renderWasteApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: 'Nächstes Jahr' }))

    expect(screen.getByText(String(CURRENT_YEAR + 1))).toBeInTheDocument()
    expect(screen.getByText(`Keine Müllkosten für ${CURRENT_YEAR + 1} erfasst.`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vorheriges Jahr' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vorheriges Jahr' }))
    expect(screen.getByText(String(CURRENT_YEAR - 1))).toBeInTheDocument()
    expect(screen.getByText(`Keine Müllkosten für ${CURRENT_YEAR - 1} erfasst.`)).toBeInTheDocument()
  })

  it('deletes an entry after confirmation', async () => {
    await createWasteCost({ year: CURRENT_YEAR, category: 'residual', amount: 92 })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWasteApp()
    await waitForLoadingToFinish()
    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(async () => expect(await listWasteCosts()).toHaveLength(0))
    confirmSpy.mockRestore()
  })
})

describe('WasteCostFormPage (create)', () => {
  it('shows validation errors instead of saving when required fields are missing', async () => {
    renderWasteApp('/muell/neu')
    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Kategorie ist erforderlich.')
    expect(await listWasteCosts()).toHaveLength(0)
  })

  it('creates an entry and shows it in the list', async () => {
    renderWasteApp('/muell/neu')

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: String(CURRENT_YEAR) } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'paper' } })
    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '24,00' } })
    fireEvent.change(screen.getByLabelText(/Notiz/), { target: { value: 'Jahresgebühr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Müllkosten' })).toBeInTheDocument())
    await waitForLoadingToFinish()

    const entries = await listWasteCosts()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.category).toBe('paper')
    expect(entries[0]?.amount).toBe(24)
    expect(entries[0]?.notes).toBe('Jahresgebühr')

    expect(await screen.findAllByText('Papier')).not.toHaveLength(0)
    expect(await screen.findAllByText('24,00 €')).not.toHaveLength(0)
  })

  it('uploads and attaches a new document on create', async () => {
    renderWasteApp('/muell/neu')

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: String(CURRENT_YEAR) } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'residual' } })
    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '92,00' } })

    const file = new File(['content'], 'gebuehrenbescheid.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(screen.getByText('gebuehrenbescheid.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const entries = await listWasteCosts()
      expect(entries).toHaveLength(1)
      expect(entries[0]?.documentId).toBeTruthy()
    })
  })

  it('offers picking an existing, unlinked document instead of uploading a new one', async () => {
    const { saveDocumentFile } = await import('../../domain/usecases/documents')
    const existing = await saveDocumentFile(
      new File(['content'], 'altes-dokument.pdf', { type: 'application/pdf' }),
      'other',
    )

    renderWasteApp('/muell/neu')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vorhandenes Dokument auswählen' })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: String(CURRENT_YEAR) } })
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'residual' } })
    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '92,00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Vorhandenes Dokument auswählen' }))
    fireEvent.change(screen.getByLabelText('Vorhandenes Dokument'), { target: { value: existing.id } })

    expect(screen.getByText('altes-dokument.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const entries = await listWasteCosts()
      expect(entries).toHaveLength(1)
      expect(entries[0]?.documentId).toBe(existing.id)
    })
  })
})

describe('WasteCostFormPage (edit)', () => {
  it('prefills existing values and updates the same record', async () => {
    const created = await createWasteCost({ year: CURRENT_YEAR, category: 'residual', amount: 92 })

    renderWasteApp(`/muell/${created.id}/bearbeiten`)
    await waitForLoadingToFinish()

    expect(screen.getByLabelText('Betrag')).toHaveValue('92')
    expect(screen.getByLabelText('Kategorie')).toHaveValue('residual')

    fireEvent.change(screen.getByLabelText('Betrag'), { target: { value: '150,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const entries = await listWasteCosts()
      expect(entries).toHaveLength(1)
      expect(entries[0]?.amount).toBe(150)
    })
  })
})

describe('WasteCostDetailPage', () => {
  it('shows the entry details and its document, with an open/close toggle', async () => {
    const { saveDocumentFile } = await import('../../domain/usecases/documents')
    const document = await saveDocumentFile(
      new File(['content'], 'gebuehrenbescheid.pdf', { type: 'application/pdf' }),
      'waste',
    )
    const created = await createWasteCost({
      year: CURRENT_YEAR,
      category: 'residual',
      amount: 92,
      notes: 'Jahresgebühr laut Gebührenbescheid',
      documentId: document.id,
    })

    renderWasteApp(`/muell/${created.id}`)
    await waitForLoadingToFinish()

    expect(screen.getByRole('heading', { name: `Müllkosten ${CURRENT_YEAR}` })).toBeInTheDocument()
    expect(screen.getByText('92,00 €')).toBeInTheDocument()
    expect(screen.getByText('Jahresgebühr laut Gebührenbescheid')).toBeInTheDocument()
    expect(screen.getByText('gebuehrenbescheid.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'In Dokumentenverwaltung öffnen' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'gebuehrenbescheid.pdf' })).toBeInTheDocument())
  })

  it('deletes the entry after confirmation and returns to the list', async () => {
    const created = await createWasteCost({ year: CURRENT_YEAR, category: 'residual', amount: 92 })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderWasteApp(`/muell/${created.id}`)
    await waitForLoadingToFinish()
    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(() =>
      expect(screen.getByText(/Noch keine Müllkosten erfasst/)).toBeInTheDocument(),
    )
    confirmSpy.mockRestore()
  })
})

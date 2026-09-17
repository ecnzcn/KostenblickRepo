import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createBillWithItems, getBill, listBillItems, listBills } from '../../domain/usecases/bills'
import { saveDocumentFile } from '../../domain/usecases/documents'
import { DocumentDetailPage } from '../documents/DocumentDetailPage'
import { BillDetailPage } from './BillDetailPage'
import { BillFormPage } from './BillFormPage'
import { BillsPage } from './BillsPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderBillsApp(initialPath = '/abrechnungen') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/abrechnungen" element={<BillsPage />} />
          <Route path="/abrechnungen/neu" element={<BillFormPage mode="create" />} />
          <Route path="/abrechnungen/:id/bearbeiten" element={<BillFormPage mode="edit" />} />
          <Route path="/abrechnungen/:id" element={<BillDetailPage />} />
          <Route path="/dokumente/:id" element={<DocumentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

describe('BillsPage', () => {
  it('shows the empty state with a call to action when there is no data', async () => {
    renderBillsApp()
    await waitForLoadingToFinish()
    expect(screen.getByText('Noch keine Abrechnung vorhanden.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrechnung erfassen' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrechnung importieren' })).toBeInTheDocument()
  })

  it('lists a created bill with its computed balance', async () => {
    await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 2302.2,
      items: [
        { categoryId: 'heating', description: 'Heizung', amount: 850 },
        { categoryId: 'water', description: 'Wasser', amount: 320 },
      ],
    })

    renderBillsApp()
    await waitForLoadingToFinish()
    expect(screen.getByText('2025')).toBeInTheDocument()
    // total (1170) < advancePayments (2302.20) -> Guthaben, not Nachzahlung.
    expect(screen.getByText(/Guthaben/)).toBeInTheDocument()
  })

  it('deletes a bill (and its items) after confirmation', async () => {
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 100,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderBillsApp()
    await waitForLoadingToFinish()
    fireEvent.click(screen.getByRole('button', { name: /löschen/i }))

    await waitFor(async () => expect(await listBills()).toHaveLength(0))
    expect(await listBillItems(bill.id)).toHaveLength(0)
    confirmSpy.mockRestore()
  })
})

describe('BillFormPage (create)', () => {
  it('shows validation errors instead of saving when a bill item has no category', async () => {
    renderBillsApp('/abrechnungen/neu')
    await screen.findByLabelText('Beschreibung der Kostenposition')

    fireEvent.change(screen.getByLabelText('Betrag der Kostenposition'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Jede Kostenposition benötigt eine Kategorie.')
    expect(await listBills()).toHaveLength(0)
  })

  it('sums multiple bill items into the total and computes Nachzahlung, saving all of it', async () => {
    renderBillsApp('/abrechnungen/neu')
    await screen.findByRole('option', { name: /Heizung/ })

    fireEvent.change(screen.getByLabelText('Abrechnungsjahr'), { target: { value: '2025' } })
    fireEvent.change(screen.getByLabelText('Vorauszahlungen'), { target: { value: '2302,20' } })

    const firstCategorySelect = screen.getAllByLabelText('Kategorie der Kostenposition')[0]!
    const firstAmountInput = screen.getAllByLabelText('Betrag der Kostenposition')[0]!
    fireEvent.change(firstCategorySelect, { target: { value: 'heating' } })
    fireEvent.change(firstAmountInput, { target: { value: '850' } })

    fireEvent.click(screen.getByRole('button', { name: '+ Kostenposition' }))
    const categorySelects = screen.getAllByLabelText('Kategorie der Kostenposition')
    const amountInputs = screen.getAllByLabelText('Betrag der Kostenposition')
    fireEvent.change(categorySelects[1]!, { target: { value: 'water' } })
    fireEvent.change(amountInputs[1]!, { target: { value: '320' } })

    // Live total preview before saving.
    expect(screen.getByText('1.170,00 €')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Abrechnungen' })).toBeInTheDocument())

    const bills = await listBills()
    expect(bills).toHaveLength(1)
    expect(bills[0]?.totalAmount).toBe(1170)
    expect(bills[0]?.balanceType).toBe('credit')
    expect(bills[0]?.balance).toBe(1132.2)

    const items = await listBillItems(bills[0]!.id)
    expect(items).toHaveLength(2)
  })
})

describe('BillFormPage (edit)', () => {
  it('prefills existing items and replaces them with the submitted set', async () => {
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 100,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })

    renderBillsApp(`/abrechnungen/${bill.id}/bearbeiten`)
    await waitForLoadingToFinish()
    await screen.findByRole('option', { name: /Heizung/ })

    expect(screen.getAllByLabelText('Betrag der Kostenposition')[0]).toHaveValue('100')

    fireEvent.change(screen.getAllByLabelText('Betrag der Kostenposition')[0]!, { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const items = await listBillItems(bill.id)
      expect(items).toHaveLength(1)
      expect(items[0]?.amount).toBe(150)
    })
  })
})

describe('BillFormPage (edit) - confirmed total amount', () => {
  async function createConfirmedBill() {
    return createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      totalAmount: 350,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })
  }

  it('shows the confirmed total, live item sum and difference, and keeps it when saving without recalculating', async () => {
    const { bill } = await createConfirmedBill()

    renderBillsApp(`/abrechnungen/${bill.id}/bearbeiten`)
    await waitForLoadingToFinish()
    await screen.findByRole('option', { name: /Heizung/ })

    expect(screen.getByText('Bestätigter Gesamtbetrag')).toBeInTheDocument()
    expect(screen.getAllByText('350,00 €').length).toBeGreaterThan(0)
    expect(screen.getByText('Positionssumme')).toBeInTheDocument()
    expect(screen.getByText('100,00 €')).toBeInTheDocument()
    expect(screen.getByText('Differenz')).toBeInTheDocument()
    expect(screen.getByText('250,00 €')).toBeInTheDocument()

    // Editing the item alone never silently changes the confirmed total.
    fireEvent.change(screen.getByLabelText('Betrag der Kostenposition'), { target: { value: '120' } })
    expect(screen.getByText('Bestätigter Gesamtbetrag')).toBeInTheDocument()
    expect(screen.getAllByText('350,00 €').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => {
      const saved = await getBill(bill.id)
      expect(saved?.totalAmount).toBe(350)
      expect(saved?.totalAmountConfirmed).toBe(true)
    })
  })

  it('discards the confirmed total and recomputes from items after "Aus Positionen neu berechnen"', async () => {
    const { bill } = await createConfirmedBill()

    renderBillsApp(`/abrechnungen/${bill.id}/bearbeiten`)
    await waitForLoadingToFinish()
    await screen.findByRole('option', { name: /Heizung/ })

    fireEvent.change(screen.getByLabelText('Betrag der Kostenposition'), { target: { value: '320' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aus Positionen neu berechnen' }))

    expect(screen.queryByText('Bestätigter Gesamtbetrag')).not.toBeInTheDocument()
    expect(screen.getByText('Gesamt')).toBeInTheDocument()
    expect(screen.getAllByText('320,00 €').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => {
      const saved = await getBill(bill.id)
      expect(saved?.totalAmount).toBe(320)
      expect(saved?.totalAmountConfirmed).toBe(false)
    })
  })
})

describe('BillDetailPage document integration', () => {
  it('links the attached document to the document management page', async () => {
    const document = await saveDocumentFile(new File(['x'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      documentId: document.id,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })

    renderBillsApp(`/abrechnungen/${bill.id}`)
    await waitForLoadingToFinish()

    await waitFor(() => expect(screen.getByText('nebenkosten.pdf')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('link', { name: 'In Dokumentenverwaltung öffnen' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'nebenkosten.pdf' })).toBeInTheDocument())
  })
})

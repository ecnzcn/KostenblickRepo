import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../../database/database'
import { getDocument, getDocumentBlob } from '../../../domain/usecases/documents'
import { listBillItems, listBills } from '../../../domain/usecases/bills'
import { ImportBillPage } from './ImportBillPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderImportApp() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/abrechnungen/import']}>
        <Routes>
          <Route path="/abrechnungen/import" element={<ImportBillPage />} />
          <Route path="/abrechnungen/:id" element={<p>Abrechnungsdetail</p>} />
          <Route path="/abrechnungen" element={<p>Abrechnungen</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

function selectFile(file: File) {
  const input = screen.getByLabelText(/Datei auswählen/) as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file] })
  fireEvent.change(input)
}

describe('Bill import workflow (full pipeline)', () => {
  it('imports a document end to end: select → OCR → review → edit → save → Bill/BillItems/Document persisted', async () => {
    renderImportApp()

    // 1. Select
    const file = new File(['%PDF-1.4 fake content'], 'nebenkosten-2025.pdf', { type: 'application/pdf' })
    selectFile(file)
    expect(await screen.findByText('nebenkosten-2025.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    // 2. Processing (indeterminate, no fake percentage bar anywhere in the DOM)
    expect(
      await screen.findByText(/Dokument wird gelesen|Text wird erkannt|Kostenpositionen werden analysiert/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    // 3. Review - prefilled from the mock OCR/parser pipeline
    await waitFor(() => expect(screen.getByLabelText('Abrechnungsjahr')).toHaveValue(2025), { timeout: 5000 })
    expect(screen.getByText('nebenkosten-2025.pdf')).toBeInTheDocument()
    const amountInputs = screen.getAllByLabelText('Betrag der Kostenposition')
    expect(amountInputs.length).toBeGreaterThan(0)

    // 4. Manual correction of a recognized item marks it as manually verified.
    fireEvent.change(amountInputs[0]!, { target: { value: '999,00' } })

    // 5. Save
    fireEvent.click(screen.getByRole('button', { name: 'Abrechnung speichern' }))
    await waitFor(() => expect(screen.getByText('Abrechnungsdetail')).toBeInTheDocument(), { timeout: 5000 })

    // 6. Persistence check ("reload" = re-query IndexedDB independently of the UI).
    const bills = await listBills()
    expect(bills).toHaveLength(1)
    const bill = bills[0]!
    expect(bill.year).toBe(2025)
    expect(bill.documentId).toBeTruthy()
    expect(bill.ocrStatus).toBe('verified')

    const items = await listBillItems(bill.id)
    expect(items.length).toBeGreaterThan(0)
    expect(items.some((item) => item.amount === 999)).toBe(true)
    expect(items.some((item) => item.manuallyVerified === true)).toBe(true)

    const document = await getDocument(bill.documentId!)
    expect(document).toBeDefined()
    expect(document?.filename).toBe('nebenkosten-2025.pdf')

    const blob = await getDocumentBlob(document!)
    expect(blob).toBeDefined()
  })

  it('cancelling on the select step does not create a document or bill', async () => {
    renderImportApp()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.getByText('Abrechnungen')).toBeInTheDocument())
    expect(await listBills()).toHaveLength(0)
  })

  it('rejects an oversized file before any processing happens', async () => {
    renderImportApp()
    const oversized = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    selectFile(oversized)
    expect(await screen.findByRole('alert')).toHaveTextContent(/zu groß/)
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled()
  })
})

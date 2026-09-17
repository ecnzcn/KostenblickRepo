import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../../database/database'
import { documentRepository } from '../../../domain/repositories/indexedDbRepositories'
import { getDocument, getDocumentBlob } from '../../../domain/usecases/documents'
import * as billsUsecase from '../../../domain/usecases/bills'
import { listBillItems, listBills } from '../../../domain/usecases/bills'
import { MockOCRService } from '../../../services/ocr/MockOCRService'
import { OCRCancelledError } from '../../../services/ocr/OCRCancelledError'
import { ocrService } from '../../../services/ocr/activeOcrService'
import { ImportBillPage } from './ImportBillPage'

// This test exercises the full UI wiring (select -> OCR -> review -> save
// -> IndexedDB), not OCR accuracy itself. The real LocalOCRService (Tesseract
// WASM in a Worker, pdfjs-dist) cannot run meaningfully inside jsdom/Vitest,
// so it is swapped for the deterministic MockOCRService here; real OCR is
// verified separately with a real browser (see the Playwright verification
// noted in the PR description).
vi.mock('../../../services/ocr/activeOcrService', () => ({
  ocrService: new MockOCRService(),
}))

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

function billFile(name = 'nebenkosten-2025.pdf') {
  return new File(['%PDF-1.4 fake content'], name, { type: 'application/pdf' })
}

async function selectAndAdvanceToReview(file: File = billFile()) {
  selectFile(file)
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(screen.getByLabelText('Abrechnungsjahr')).toHaveValue(2025), { timeout: 5000 })
}

describe('Bill import workflow (full pipeline)', () => {
  it('imports a document end to end: select → OCR → review → edit → save → Bill/BillItems/Document persisted', async () => {
    renderImportApp()

    // 1. Select
    const file = new File(['%PDF-1.4 fake content'], 'nebenkosten-2025.pdf', { type: 'application/pdf' })
    selectFile(file)
    expect(await screen.findByText('nebenkosten-2025.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

    // 2. Processing (indeterminate spinner, no fake percentage bar anywhere in the DOM)
    expect(await screen.findByRole('status', { name: 'Verarbeitung' })).toBeInTheDocument()
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

    // The recognized total (1.940,00 €) was never touched in this run, so
    // it - not a recomputed sum of the edited items - is what gets saved.
    expect(bill.totalAmount).toBe(1940)

    const document = await getDocument(bill.documentId!)
    expect(document).toBeDefined()
    expect(document?.filename).toBe('nebenkosten-2025.pdf')

    const blob = await getDocumentBlob(document!)
    expect(blob).toBeDefined()
  })

  // Test B: a manually edited total amount is what actually gets persisted,
  // not silently recomputed from the (possibly incomplete) item list.
  it('persists a manually edited total amount instead of silently recomputing it from items', async () => {
    renderImportApp()
    await selectAndAdvanceToReview()

    const totalInput = screen.getByLabelText('Erkannte Gesamtsumme')
    expect(totalInput).toHaveValue('1940,00')
    fireEvent.change(totalInput, { target: { value: '1300,00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Abrechnung speichern' }))
    await waitFor(() => expect(screen.getByText('Abrechnungsdetail')).toBeInTheDocument(), { timeout: 5000 })

    const bills = await listBills()
    expect(bills).toHaveLength(1)
    expect(bills[0]?.totalAmount).toBe(1300)
  })

  it('cancelling on the select step does not create a document or bill', async () => {
    renderImportApp()
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.getByText('Abrechnungen')).toBeInTheDocument())
    expect(await listBills()).toHaveLength(0)
  })

  // Test C: cancelling in the review step must not leave a Bill, BillItems,
  // or a dangling temporary Document behind.
  it('cancelling in the review step creates nothing and returns to the bills list', async () => {
    renderImportApp()
    await selectAndAdvanceToReview()

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.getByText('Abrechnungen')).toBeInTheDocument())

    expect(await listBills()).toHaveLength(0)
    expect(await documentRepository.getAll()).toHaveLength(0)
  })

  // Test D: cancelling mid-OCR must abort extraction, clean up the
  // already-saved Document, create nothing, and show no error (a normal,
  // user-initiated cancellation is not a failure).
  it('cancelling during OCR processing aborts extraction and cleans up, without an error', async () => {
    const abortAware = vi.spyOn(ocrService, 'extractBillData').mockImplementation(
      (_file, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new OCRCancelledError()))
        }),
    )

    renderImportApp()
    selectFile(billFile())
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await screen.findByRole('status', { name: 'Verarbeitung' })

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.getByLabelText(/Datei auswählen/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await listBills()).toHaveLength(0)
    expect(await documentRepository.getAll()).toHaveLength(0)

    abortAware.mockRestore()
  })

  // Test E: a failed save must leave the review screen open with an error,
  // no partial Bill in the database, the Document intact, and a retry must
  // succeed once the underlying problem is gone.
  it(
    'shows an error and keeps the document on a failed save, and allows retrying',
    async () => {
      renderImportApp()
      await selectAndAdvanceToReview()

      const failingSave = vi.spyOn(billsUsecase, 'createBillWithItems').mockRejectedValueOnce(new Error('simulated failure'))

      fireEvent.click(screen.getByRole('button', { name: 'Abrechnung speichern' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/nicht gespeichert werden/)

      // Still in review - the form is intact and nothing was persisted.
      expect(screen.getByLabelText('Abrechnungsjahr')).toBeInTheDocument()
      expect(await listBills()).toHaveLength(0)
      expect(await documentRepository.getAll()).toHaveLength(1)

      failingSave.mockRestore()
      fireEvent.click(screen.getByRole('button', { name: 'Abrechnung speichern' }))
      await waitFor(() => expect(screen.getByText('Abrechnungsdetail')).toBeInTheDocument(), { timeout: 5000 })
      expect(await listBills()).toHaveLength(1)
    },
    10000,
  )

  it('rejects an oversized file before any processing happens', async () => {
    renderImportApp()
    const oversized = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    selectFile(oversized)
    expect(await screen.findByRole('alert')).toHaveTextContent(/zu groß/)
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled()
  })
})

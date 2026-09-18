import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import { createBillWithItems } from '../../domain/usecases/bills'
import { createContract } from '../../domain/usecases/contracts'
import { saveDocumentFile } from '../../domain/usecases/documents'
import { createWasteCost } from '../../domain/usecases/wasteCosts'
import { BillDetailPage } from '../bills/BillDetailPage'
import { ContractDetailPage } from '../contracts/ContractDetailPage'
import { WasteCostDetailPage } from '../waste/WasteCostDetailPage'
import { DocumentDetailPage } from './DocumentDetailPage'
import { DocumentsPage } from './DocumentsPage'

beforeEach(async () => {
  await deleteDatabase()
})

function renderDocumentsApp(initialPath = '/dokumente') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/dokumente" element={<DocumentsPage />} />
          <Route path="/dokumente/:id" element={<DocumentDetailPage />} />
          <Route path="/abrechnungen/:id" element={<BillDetailPage />} />
          <Route path="/vertraege/:id" element={<ContractDetailPage />} />
          <Route path="/muell/:id" element={<WasteCostDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByText('Daten werden geladen …')).not.toBeInTheDocument())
}

describe('DocumentsPage', () => {
  it('shows the empty state when there are no documents', async () => {
    renderDocumentsApp()
    await waitForLoadingToFinish()
    expect(
      screen.getByText(/Noch keine Dokumente\. Hier werden deine Rechnungen, Verträge/),
    ).toBeInTheDocument()
  })

  it('lists every document with its type and size', async () => {
    await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')
    await saveDocumentFile(new File(['b'], 'stromvertrag.pdf', { type: 'application/pdf' }), 'contract')

    renderDocumentsApp()
    await waitForLoadingToFinish()

    expect(screen.getByText('nebenkosten.pdf')).toBeInTheDocument()
    expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument()
    expect(screen.getAllByText(/Kein OCR/).length).toBe(2)
  })

  it('filters the list by search text', async () => {
    await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')
    await saveDocumentFile(new File(['b'], 'stromvertrag.pdf', { type: 'application/pdf' }), 'contract')

    renderDocumentsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Dokumente durchsuchen'), { target: { value: 'strom' } })

    expect(screen.queryByText('nebenkosten.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument()
  })

  it('filters the list by document type chip', async () => {
    await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')
    await saveDocumentFile(new File(['b'], 'stromvertrag.pdf', { type: 'application/pdf' }), 'contract')

    renderDocumentsApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: 'Verträge' }))

    expect(screen.queryByText('nebenkosten.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('stromvertrag.pdf')).toBeInTheDocument()
  })

  it('shows a dedicated message for an empty search result', async () => {
    await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')

    renderDocumentsApp()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Dokumente durchsuchen'), { target: { value: 'does-not-exist' } })

    expect(screen.getByText('Keine Dokumente gefunden. Passe deine Suche oder Filter an.')).toBeInTheDocument()
  })

  it('opens a document detail page when clicked', async () => {
    await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')

    renderDocumentsApp()
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByText('nebenkosten.pdf'))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'nebenkosten.pdf' })).toBeInTheDocument())
  })
})

describe('DocumentDetailPage', () => {
  it('shows metadata, OCR status and no linked entity for a standalone document', async () => {
    const document = await saveDocumentFile(new File(['a'], 'sonstiges.pdf', { type: 'application/pdf' }), 'other')

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    expect(screen.getByRole('heading', { name: 'sonstiges.pdf' })).toBeInTheDocument()
    expect(screen.getAllByText('Sonstige').length).toBeGreaterThan(0)
    expect(screen.getByText('Kein OCR')).toBeInTheDocument()
    expect(screen.queryByText('Verknüpft mit')).not.toBeInTheDocument()
  })

  it('shows the linked Bill and navigates to it', async () => {
    const document = await saveDocumentFile(new File(['a'], 'nebenkosten.pdf', { type: 'application/pdf' }), 'bill')
    await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      documentId: document.id,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    const link = screen.getByRole('link', { name: 'Abrechnung 2025' })
    fireEvent.click(link)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Jahresabrechnung 2025' })).toBeInTheDocument())
  })

  it('shows the linked Contract and navigates to it', async () => {
    const document = await saveDocumentFile(new File(['a'], 'vertrag.pdf', { type: 'application/pdf' }), 'contract')
    const contract = await createContract({
      categoryId: 'electricity',
      provider: 'EnBW',
      monthlyCost: 60,
      startDate: '2025-01-01T00:00:00.000Z',
      autoRenewal: true,
      reminderEnabled: false,
    })
    const { setContractDocument } = await import('../../domain/usecases/contracts')
    await setContractDocument(contract.id, document.id)

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('link', { name: 'EnBW' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'EnBW' })).toBeInTheDocument())
  })

  it('shows the linked WasteCost and navigates to it', async () => {
    const document = await saveDocumentFile(new File(['a'], 'muellgebuehren.pdf', { type: 'application/pdf' }), 'other')
    await createWasteCost({
      year: 2025,
      category: 'residual',
      amount: 120,
      documentId: document.id,
    })

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    const link = screen.getByRole('link', { name: 'Müllkosten 2025' })
    fireEvent.click(link)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Müllkosten 2025' })).toBeInTheDocument())
  })

  it('deletes the document after confirmation and returns to the list', async () => {
    const document = await saveDocumentFile(new File(['a'], 'sonstiges.pdf', { type: 'application/pdf' }), 'other')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: 'Dokument löschen' }))

    await waitFor(() =>
      expect(screen.getByText(/Noch keine Dokumente\. Hier werden deine Rechnungen, Verträge/)).toBeInTheDocument(),
    )
    confirmSpy.mockRestore()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const document = await saveDocumentFile(new File(['a'], 'sonstiges.pdf', { type: 'application/pdf' }), 'other')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderDocumentsApp(`/dokumente/${document.id}`)
    await waitForLoadingToFinish()

    fireEvent.click(screen.getByRole('button', { name: 'Dokument löschen' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'sonstiges.pdf' })).toBeInTheDocument())
    confirmSpy.mockRestore()
  })
})

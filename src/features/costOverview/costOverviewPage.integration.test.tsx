import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CostOverviewPage } from './CostOverviewPage'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { deleteDatabase } from '../../database/database'
import {
  billItemRepository,
  billRepository,
  costEntryRepository,
  wasteCostRepository,
} from '../../domain/repositories/indexedDbRepositories'
import type { Bill, BillItem, CostEntry, WasteCost } from '../../domain/models/entities'
import { formatCurrency } from '../../utils/formatters'
import { BillDetailPage } from '../bills/BillDetailPage'
import { CostDetailPage } from '../costs/CostDetailPage'
import { StatisticsPage } from '../statistics/StatisticsPage'
import { WasteCostDetailPage } from '../waste/WasteCostDetailPage'

const syncBase = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
}

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  ...syncBase,
  id: 'b1',
  userId: 'u1',
  type: 'annual_statement',
  year: new Date().getFullYear(),
  totalAmount: 0,
  advancePayments: 0,
  balance: 0,
  balanceType: 'none',
  ocrStatus: 'not_started',
  ...overrides,
})

const billItem = (overrides: Partial<BillItem> = {}): BillItem => ({
  ...syncBase,
  id: 'bi1',
  billId: 'b1',
  categoryId: 'heating',
  description: 'Heizkosten',
  amount: 0,
  confidence: 1,
  manuallyVerified: true,
  ...overrides,
})

const wasteCost = (overrides: Partial<WasteCost> = {}): WasteCost => ({
  ...syncBase,
  id: 'w1',
  userId: 'u1',
  year: new Date().getFullYear(),
  category: 'residual',
  amount: 0,
  ...overrides,
})

const costEntry = (overrides: Partial<CostEntry> = {}): CostEntry => ({
  ...syncBase,
  id: 'ce1',
  userId: 'u1',
  categoryId: 'water',
  amount: 0,
  date: `${new Date().getFullYear()}-06-01T00:00:00.000Z`,
  source: 'manual',
  ...overrides,
})

function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, ' ')
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<CostOverviewPage />} />
          <Route path="/abrechnungen/:id" element={<BillDetailPage />} />
          <Route path="/muell/:id" element={<WasteCostDetailPage />} />
          <Route path="/kosten/:id" element={<CostDetailPage />} />
          <Route path="/statistik" element={<StatisticsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

describe('CostOverviewPage (integration: IndexedDB fixtures -> use case -> page)', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('shows the empty state when the database genuinely has no data', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/Noch keine Kostendaten vorhanden/)).toBeInTheDocument())
  })

  it('combines Bill, WasteCost and CostEntry into one total, without adding BillItems', async () => {
    const year = new Date().getFullYear()
    const savedBill = await billRepository.save(bill({ id: 'b1', year, totalAmount: 1000 }))
    await billItemRepository.save(billItem({ id: 'bi1', billId: savedBill.id, categoryId: 'heating', amount: 600 }))
    await billItemRepository.save(billItem({ id: 'bi2', billId: savedBill.id, categoryId: 'water', amount: 400 }))
    await wasteCostRepository.save(wasteCost({ id: 'w1', year, amount: 100 }))
    await costEntryRepository.save(costEntry({ id: 'ce1', categoryId: 'water', amount: 40 }))

    renderPage()

    await waitFor(() => expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0))
    // 1000 (Bill.totalAmount) + 100 (WasteCost) + 40 (manual) = 1140, never
    // 1000 + 600 + 400 + 100 + 40 (which would double-count the BillItems).
    expect(screen.getAllByText(money(1000)).length).toBeGreaterThan(0)
  })

  it('surfaces a possible-duplicate warning when a waste-categorized BillItem and a WasteCost coexist for the same year, without removing either amount', async () => {
    const year = new Date().getFullYear()
    const savedBill = await billRepository.save(bill({ id: 'b1', year, totalAmount: 1000 }))
    await billItemRepository.save(billItem({ id: 'bi1', billId: savedBill.id, categoryId: 'waste', amount: 100 }))
    await wasteCostRepository.save(wasteCost({ id: 'w1', year, amount: 100 }))

    renderPage()

    await waitFor(() => expect(screen.getByText('⚠ Möglicher Überschneidungsfall')).toBeInTheDocument())
    expect(screen.getAllByText(money(1100)).length).toBeGreaterThan(0)
  })

  it('navigates from a Bill cost position to its real BillDetailPage', async () => {
    const year = new Date().getFullYear()
    await billRepository.save(bill({ id: 'b1', year, totalAmount: 1000 }))

    renderPage()
    await waitFor(() => expect(screen.getByText('Jahresabrechnung ' + year)).toBeInTheDocument())

    fireEvent.click(screen.getByText('Jahresabrechnung ' + year))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Jahresabrechnung ' + year })).toBeInTheDocument(),
    )
  })

  it('navigates from a WasteCost cost position to its real WasteCostDetailPage', async () => {
    const year = new Date().getFullYear()
    await wasteCostRepository.save(wasteCost({ id: 'w1', year, amount: 100 }))

    renderPage()
    await waitFor(() => expect(screen.getByText('Restmüll')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Restmüll'))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Müllkosten ' + year })).toBeInTheDocument())
  })

  it('navigates from a manual cost position to its real CostDetailPage', async () => {
    await costEntryRepository.save(costEntry({ id: 'ce1', categoryId: 'water', amount: 40, notes: 'Wasser Nachzahlung' }))

    renderPage()
    await waitFor(() => expect(screen.getByText('Wasser Nachzahlung')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Wasser Nachzahlung'))

    await waitFor(() => expect(screen.getByRole('heading', { name: '💧 Wasser' })).toBeInTheDocument())
  })

  it('never invents a date for a WasteCost or a Bill without a period', async () => {
    const year = new Date().getFullYear()
    await billRepository.save(bill({ id: 'b1', year, totalAmount: 500 }))
    await wasteCostRepository.save(wasteCost({ id: 'w1', year, amount: 100 }))

    renderPage()

    await waitFor(() => expect(screen.getAllByText(new RegExp(`${year} · Kein Einzeldatum`)).length).toBe(2))
  })

  it('explains the Gesamtkosten definition and links to the real Statistik page', async () => {
    const year = new Date().getFullYear()
    await billRepository.save(bill({ id: 'b1', year, totalAmount: 500 }))

    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Die Kostenübersicht zeigt die tatsächlichen Gesamtkosten/)).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('link', { name: /Zur Statistik/ }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Statistik' })).toBeInTheDocument())
  })
})

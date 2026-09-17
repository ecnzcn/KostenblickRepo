import { render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { StatisticsPage } from './StatisticsPage'
import { deleteDatabase } from '../../database/database'
import { billItemRepository, billRepository } from '../../domain/repositories/indexedDbRepositories'
import type { Bill, BillItem } from '../../domain/models/entities'
import { formatCurrency } from '../../utils/formatters'

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

function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, ' ')
}

function renderPage() {
  return render(
    <HashRouter>
      <StatisticsPage />
    </HashRouter>,
  )
}

describe('StatisticsPage (integration: IndexedDB fixtures -> use case -> page)', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('shows the empty state when the database genuinely has no bills', async () => {
    renderPage()
    await waitFor(() =>
      expect(
        screen.getByText('Noch keine Kostendaten vorhanden. Importiere deine erste Abrechnung, um Statistiken zu sehen.'),
      ).toBeInTheDocument(),
    )
  })

  it('renders the yearly total, category breakdown and year switching from real repository data', async () => {
    const year = new Date().getFullYear()
    const currentYearBill = await billRepository.save(bill({ id: 'current', year, totalAmount: 1000 }))
    await billItemRepository.save(billItem({ id: 'i1', billId: currentYearBill.id, categoryId: 'heating', amount: 600 }))
    await billItemRepository.save(billItem({ id: 'i2', billId: currentYearBill.id, categoryId: 'water', amount: 300 }))

    const previousYearBill = await billRepository.save(bill({ id: 'previous', year: year - 1, totalAmount: 800 }))
    await billItemRepository.save(billItem({ id: 'i3', billId: previousYearBill.id, categoryId: 'heating', amount: 800 }))

    renderPage()

    await waitFor(() => expect(screen.getAllByText(money(1000)).length).toBeGreaterThan(0))
    expect(screen.getAllByText(money(800)).length).toBeGreaterThan(0)
    expect(screen.getByText('+25,0 %')).toBeInTheDocument()
    expect(screen.getAllByText('Heizung').length).toBeGreaterThan(0)
    expect(screen.getByText(/nicht zugeordnete Differenz/)).toBeInTheDocument()

    const yearSelect = screen.getByLabelText('Jahr') as HTMLSelectElement
    expect(yearSelect.value).toBe(String(year))
  })
})

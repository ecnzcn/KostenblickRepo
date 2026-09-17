import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CostOverviewPage } from './CostOverviewPage'
import type { CentralCostData } from './costOverview.types'
import { formatCurrency } from '../../utils/formatters'

const { getCentralCostDataMock } = vi.hoisted(() => ({
  getCentralCostDataMock: vi.fn(),
}))

vi.mock('../../domain/usecases/centralCosts', () => ({
  getCentralCostData: getCentralCostDataMock,
}))

function renderPage() {
  return render(
    <HashRouter>
      <CostOverviewPage />
    </HashRouter>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
}

function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, ' ')
}

const emptyData: CentralCostData = {
  year: new Date().getFullYear(),
  years: [],
  summary: {
    year: new Date().getFullYear(),
    totalAmount: 0,
    billAmount: 0,
    wasteAmount: 0,
    manualAmount: 0,
    monthlyAttributedTotal: 0,
    unallocatedForMonthView: 0,
    monthlyDataAvailable: false,
    possibleDuplicateCount: 0,
    warnings: [],
  },
  items: [],
  monthly: [],
  categories: [],
  sourceBreakdown: [],
  warnings: [],
}

const populatedData: CentralCostData = {
  year: 2026,
  years: [2025, 2026],
  summary: {
    year: 2026,
    totalAmount: 1140,
    billAmount: 1000,
    wasteAmount: 100,
    manualAmount: 40,
    monthlyAttributedTotal: 40,
    unallocatedForMonthView: 1100,
    monthlyDataAvailable: true,
    possibleDuplicateCount: 1,
    warnings: [
      {
        type: 'possible_duplicate_waste',
        year: 2026,
        description:
          'Für 2026 wurden Müllkosten sowohl in einer Abrechnung als auch separat unter Müllkosten erfasst. Bitte prüfen Sie diese Positionen.',
      },
    ],
  },
  items: [],
  monthly: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, '0')}`,
    amount: index === 5 ? 40 : 0,
    hasActualData: index === 5,
  })),
  categories: [
    { categoryId: 'waste', categoryName: 'Müll', categoryIcon: '🗑️', amount: 100, percentage: 71.4 },
    { categoryId: 'water', categoryName: 'Wasser', categoryIcon: '💧', amount: 40, percentage: 28.6 },
  ],
  sourceBreakdown: [
    { source: 'bill', amount: 1000, count: 1 },
    { source: 'waste', amount: 100, count: 1 },
    { source: 'manual', amount: 40, count: 1 },
  ],
  warnings: [
    {
      type: 'possible_duplicate_waste',
      year: 2026,
      description:
        'Für 2026 wurden Müllkosten sowohl in einer Abrechnung als auch separat unter Müllkosten erfasst. Bitte prüfen Sie diese Positionen.',
    },
  ],
}

describe('CostOverviewPage', () => {
  beforeEach(() => {
    getCentralCostDataMock.mockReset()
  })

  it('shows a loading indicator, then the empty state when there is no data', async () => {
    getCentralCostDataMock.mockResolvedValue(emptyData)
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitForLoadingToFinish()

    expect(screen.getByText(/Noch keine Kostendaten vorhanden/)).toBeInTheDocument()
  })

  it('renders the combined total and the bill/waste/manual breakdown', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0)
    expect(screen.getByText(money(1000))).toBeInTheDocument()
    expect(screen.getAllByText(money(100)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(money(40)).length).toBeGreaterThan(0)
  })

  it('surfaces a possible-duplicate warning without hiding or removing any amount', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('⚠ Mögliche Doppelzählung')).toBeInTheDocument()
    expect(screen.getByText(/sowohl in einer Abrechnung als auch separat unter Müllkosten erfasst/)).toBeInTheDocument()
    // The full total (including the possibly-duplicated waste amount) is still shown, not silently reduced.
    expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0)
  })

  it('shows the unallocated-for-month-view note when part of the total cannot be attributed to a month', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText(/lassen sich keinem einzelnen Monat zuordnen/)).toBeInTheDocument()
  })

  it('re-fetches when a different year is selected', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2025' } })
    await waitFor(() => expect(getCentralCostDataMock).toHaveBeenLastCalledWith(2025))
  })

  it('shows an error state on failure and recovers via retry', async () => {
    getCentralCostDataMock.mockRejectedValueOnce(new Error('boom'))
    getCentralCostDataMock.mockResolvedValueOnce(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Kostenübersicht konnte nicht geladen werden.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    await waitForLoadingToFinish()

    expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0)
  })
})

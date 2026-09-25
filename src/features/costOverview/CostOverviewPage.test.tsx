import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CostOverviewPage } from './CostOverviewPage'
import type { CentralCostData, CentralCostItem } from './costOverview.types'
import { formatCurrency, formatDate } from '../../utils/formatters'

const { getCentralCostDataMock, listContractsMock } = vi.hoisted(() => ({
  getCentralCostDataMock: vi.fn(),
  listContractsMock: vi.fn(),
}))

vi.mock('../../domain/usecases/centralCosts', () => ({
  getCentralCostData: getCentralCostDataMock,
}))

vi.mock('../../domain/usecases/contracts', async () => {
  const actual = await vi.importActual<typeof import('../../domain/usecases/contracts')>(
    '../../domain/usecases/contracts',
  )
  return { ...actual, listContracts: listContractsMock }
})

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

const billItem: CentralCostItem = {
  id: 'bill:b1',
  source: 'bill',
  amount: 1000,
  year: 2026,
  periodStart: '2026-01-01T00:00:00.000Z',
  periodEnd: '2026-12-31T00:00:00.000Z',
  description: 'Jahresabrechnung 2026',
  sourceEntityId: 'b1',
  isEstimate: false,
}

const wasteItem: CentralCostItem = {
  id: 'waste:w1',
  source: 'waste',
  amount: 100,
  year: 2026,
  categoryId: 'waste',
  wasteCategory: 'residual',
  description: 'Restmüll',
  sourceEntityId: 'w1',
  isEstimate: false,
}

const manualItem: CentralCostItem = {
  id: 'manual:ce1',
  source: 'manual',
  amount: 40,
  year: 2026,
  date: '2026-09-15T00:00:00.000Z',
  categoryId: 'water',
  description: 'Wasser Nachzahlung',
  sourceEntityId: 'ce1',
  isEstimate: false,
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
          'Möglicher Überschneidungsfall: Für 2026 wurden Müllkosten sowohl innerhalb einer Abrechnung als auch separat unter Müllkosten erfasst. Das kann, muss aber nicht dieselbe Kostenposition doppelt sein - bitte prüfen Sie, ob dieselbe Ausgabe bereits an anderer Stelle berücksichtigt wurde.',
      },
    ],
  },
  items: [billItem, wasteItem, manualItem],
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
        'Möglicher Überschneidungsfall: Für 2026 wurden Müllkosten sowohl innerhalb einer Abrechnung als auch separat unter Müllkosten erfasst. Das kann, muss aber nicht dieselbe Kostenposition doppelt sein - bitte prüfen Sie, ob dieselbe Ausgabe bereits an anderer Stelle berücksichtigt wurde.',
    },
  ],
}

describe('CostOverviewPage', () => {
  beforeEach(() => {
    getCentralCostDataMock.mockReset()
    listContractsMock.mockReset()
    listContractsMock.mockResolvedValue([])
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
    expect(screen.getAllByText(money(1000)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(money(100)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(money(40)).length).toBeGreaterThan(0)
  })

  it('labels the total "Gesamtkosten" with an explanatory source breakdown, distinct from the statistics page\'s "Abrechnungskosten"', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Gesamtkosten 2026')).toBeInTheDocument()
    expect(screen.getByText('Abrechnungen + Müll + manuelle Kosten')).toBeInTheDocument()
  })

  it('surfaces a possible-duplicate warning without hiding or removing any amount', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('⚠ Möglicher Überschneidungsfall')).toBeInTheDocument()
    expect(screen.getByText(/sowohl innerhalb einer Abrechnung als auch separat unter Müllkosten erfasst/)).toBeInTheDocument()
    // The full total (including the possibly-duplicated waste amount) is still shown, not silently reduced.
    expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0)
  })

  it('shows the unallocated-for-month-view note when part of the total cannot be attributed to a month', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText(/lassen sich keinem einzelnen Monat zuordnen/)).toBeInTheDocument()
  })

  it('shows running contract costs separately from the actual-cost total', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    listContractsMock.mockResolvedValue([
      {
        id: 'c1',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
        syncVersion: 1,
        userId: 'u1',
        categoryId: 'internet',
        provider: 'Telekom',
        monthlyCost: 40,
        startDate: '2020-01-01T00:00:00.000Z',
        autoRenewal: true,
        reminderEnabled: false,
      },
    ])
    renderPage()
    await waitForLoadingToFinish()

    await waitFor(() => expect(screen.getByText('Laufende Vertragskosten')).toBeInTheDocument())
    expect(screen.getByText(`${money(40)} / Monat`)).toBeInTheDocument()
    expect(screen.getByText(`${money(480)} / Jahr`)).toBeInTheDocument()
    // The Gesamtkosten total is unaffected by the contract's cost.
    expect(screen.getAllByText(money(1140)).length).toBeGreaterThan(0)
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

describe('CostOverviewItemsList (drill-down)', () => {
  beforeEach(() => {
    getCentralCostDataMock.mockReset()
  })

  it('lists each cost item with its source label, its available date and a link to the source entity', async () => {
    getCentralCostDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Kostenpositionen')).toBeInTheDocument()

    expect(screen.getByText('Jahresabrechnung 2026')).toBeInTheDocument()
    expect(
      screen.getByText(`Abrechnung · ${formatDate(billItem.periodStart!)} – ${formatDate(billItem.periodEnd!)}`),
    ).toBeInTheDocument()
    expect(screen.getByText('Jahresabrechnung 2026').closest('a')?.getAttribute('href')).toContain(
      `/abrechnungen/${billItem.sourceEntityId}`,
    )

    expect(screen.getByText('Restmüll')).toBeInTheDocument()
    expect(screen.getByText('Müllkosten · 2026 · Kein Einzeldatum')).toBeInTheDocument()
    expect(screen.getByText('Restmüll').closest('a')?.getAttribute('href')).toContain(
      `/muell/${wasteItem.sourceEntityId}`,
    )

    expect(screen.getByText('Wasser Nachzahlung')).toBeInTheDocument()
    expect(screen.getByText(`Manuell · ${formatDate(manualItem.date!)}`)).toBeInTheDocument()
    expect(screen.getByText('Wasser Nachzahlung').closest('a')?.getAttribute('href')).toContain(
      `/kosten/${manualItem.sourceEntityId}`,
    )
  })

  it('never invents a date for a WasteCost or a Bill without a period - both show "Kein Einzeldatum"', async () => {
    const billWithoutPeriod: CentralCostItem = {
      id: 'bill:b2',
      source: 'bill',
      amount: 500,
      year: 2026,
      description: 'Sonderabrechnung 2026',
      sourceEntityId: 'b2',
      isEstimate: false,
    }

    getCentralCostDataMock.mockResolvedValue({ ...populatedData, items: [billWithoutPeriod, wasteItem] })
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getAllByText(/2026 · Kein Einzeldatum/).length).toBe(2)
  })

  it('sorts items with a real date most recently first, and undated items last', async () => {
    const early: CentralCostItem = {
      id: 'manual:early',
      source: 'manual',
      amount: 10,
      year: 2026,
      date: '2026-01-05T00:00:00.000Z',
      description: 'Früher Manuell-Eintrag',
      sourceEntityId: 'ce-early',
      isEstimate: false,
    }
    const late: CentralCostItem = {
      id: 'manual:late',
      source: 'manual',
      amount: 20,
      year: 2026,
      date: '2026-06-01T00:00:00.000Z',
      description: 'Später Manuell-Eintrag',
      sourceEntityId: 'ce-late',
      isEstimate: false,
    }
    const middleBill: CentralCostItem = {
      id: 'bill:middle',
      source: 'bill',
      amount: 30,
      year: 2026,
      periodEnd: '2026-03-01T00:00:00.000Z',
      description: 'Zwischenabrechnung',
      sourceEntityId: 'b-middle',
      isEstimate: false,
    }
    const undated: CentralCostItem = {
      id: 'waste:undated',
      source: 'waste',
      amount: 40,
      year: 2026,
      categoryId: 'waste',
      wasteCategory: 'residual',
      description: 'Undatierter Müll-Eintrag',
      sourceEntityId: 'w-undated',
      isEstimate: false,
    }

    getCentralCostDataMock.mockResolvedValue({ ...populatedData, items: [undated, early, late, middleBill] })
    renderPage()
    await waitForLoadingToFinish()

    const order = screen.getAllByRole('link').map((link) => link.textContent ?? '')
    const lateIndex = order.findIndex((text) => text.includes('Später Manuell-Eintrag'))
    const middleIndex = order.findIndex((text) => text.includes('Zwischenabrechnung'))
    const earlyIndex = order.findIndex((text) => text.includes('Früher Manuell-Eintrag'))
    const undatedIndex = order.findIndex((text) => text.includes('Undatierter Müll-Eintrag'))

    expect(lateIndex).toBeGreaterThanOrEqual(0)
    expect(lateIndex).toBeLessThan(middleIndex)
    expect(middleIndex).toBeLessThan(earlyIndex)
    expect(earlyIndex).toBeLessThan(undatedIndex)
  })

  it('shows a dedicated empty state instead of an empty container when the year has no cost items', async () => {
    getCentralCostDataMock.mockResolvedValue({ ...populatedData, items: [] })
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Kostenpositionen')).toBeInTheDocument()
    expect(screen.getByText('Keine Kostenpositionen für 2026 vorhanden.')).toBeInTheDocument()
  })
})

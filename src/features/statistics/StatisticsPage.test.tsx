import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StatisticsPage } from './StatisticsPage'
import type { StatisticsData } from './statistics.types'
import { formatCurrency } from '../../utils/formatters'

const { getStatisticsDataMock } = vi.hoisted(() => ({
  getStatisticsDataMock: vi.fn(),
}))

vi.mock('../../domain/usecases/statistics/calculateStatistics', () => ({
  getStatisticsData: getStatisticsDataMock,
}))

function renderPage() {
  return render(
    <HashRouter>
      <StatisticsPage />
    </HashRouter>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
}

function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, ' ')
}

const emptyData: StatisticsData = {
  years: [],
  yearStatistics: [],
  summary: {
    year: new Date().getFullYear(),
    totalAmount: 0,
    itemizedAmount: 0,
    unassignedDifference: 0,
    billCount: 0,
  },
  categories: [],
  topCostPositions: [],
  monthlyStatistics: [],
  hasMonthlyData: false,
}

const populatedData: StatisticsData = {
  years: [2025, 2026],
  yearStatistics: [
    { year: 2025, amount: 800 },
    { year: 2026, amount: 1000 },
  ],
  summary: {
    year: 2026,
    totalAmount: 1000,
    itemizedAmount: 900,
    unassignedDifference: 100,
    billCount: 1,
    previousYearAmount: 800,
    yearOverYearChange: 200,
    yearOverYearChangePercent: 25,
  },
  categories: [{ categoryId: 'heating', categoryName: 'Heizung', categoryIcon: '🔥', amount: 600, percentage: 66.7 }],
  topCostPositions: [
    { categoryId: 'heating', categoryName: 'Heizung', description: 'Heizkosten', amount: 600, percentage: 66.7 },
  ],
  monthlyStatistics: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, '0')}`,
    amount: index === 2 ? 80 : 0,
    hasActualData: index === 2,
  })),
  hasMonthlyData: true,
}

describe('StatisticsPage', () => {
  beforeEach(() => {
    getStatisticsDataMock.mockReset()
  })

  it('shows a loading indicator, then the empty state when there is no data', async () => {
    getStatisticsDataMock.mockResolvedValue(emptyData)
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitForLoadingToFinish()

    expect(
      screen.getByText('Noch keine Kostendaten vorhanden. Importiere deine erste Abrechnung, um Statistiken zu sehen.'),
    ).toBeInTheDocument()
  })

  it('renders the yearly total, YoY comparison, categories and discrepancy notice', async () => {
    getStatisticsDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getAllByText(money(1000)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(money(800)).length).toBeGreaterThan(0)
    expect(screen.getByText('+25,0 %')).toBeInTheDocument()
    expect(screen.getAllByText('Heizung').length).toBeGreaterThan(0)
    expect(screen.getByText(/nicht zugeordnete Differenz/)).toBeInTheDocument()
  })

  it('labels the yearly total "Abrechnungskosten", distinct from the central cost overview\'s "Gesamtkosten"', async () => {
    getStatisticsDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Abrechnungskosten 2026')).toBeInTheDocument()
    expect(screen.queryByText('Gesamtkosten 2026')).not.toBeInTheDocument()
  })

  it('shows "Keine Vergleichsbasis" styling (a dash) when the previous year was 0', async () => {
    getStatisticsDataMock.mockResolvedValue({
      ...populatedData,
      summary: { ...populatedData.summary, previousYearAmount: 0, yearOverYearChange: 1000, yearOverYearChangePercent: null },
    })
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Vorjahr war 0 € – keine Vergleichsbasis')).toBeInTheDocument()
  })

  it('re-fetches statistics when a different year is selected', async () => {
    getStatisticsDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByLabelText('Jahr'), { target: { value: '2025' } })
    await waitFor(() => expect(getStatisticsDataMock).toHaveBeenLastCalledWith(2025))
  })

  it('shows an error state on failure and recovers via retry', async () => {
    getStatisticsDataMock.mockRejectedValueOnce(new Error('boom'))
    getStatisticsDataMock.mockResolvedValueOnce(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Statistik konnte nicht geladen werden.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    await waitForLoadingToFinish()

    expect(screen.getAllByText(money(1000)).length).toBeGreaterThan(0)
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { DashboardData } from './dashboard.types'
import { formatCurrency } from '../../utils/formatters'

const { getDashboardDataMock } = vi.hoisted(() => ({
  getDashboardDataMock: vi.fn(),
}))

vi.mock('../../domain/usecases/dashboard', () => ({
  getDashboardData: getDashboardDataMock,
}))

function renderPage() {
  return render(
    <HashRouter>
      <DashboardPage />
    </HashRouter>,
  )
}

async function waitForLoadingToFinish() {
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
}

// Testing Library normalizes whitespace in rendered text (including the
// non-breaking space Intl.NumberFormat inserts before "€") but not a plain
// string matcher, so normalize the expected value the same way before
// comparing.
function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, ' ')
}

const emptyData: DashboardData = {
  currentMonthCost: 0,
  previousMonthCost: 0,
  currentMonthChangePercent: null,
  currentYearCost: 0,
  currentYearChangePercent: null,
  monthlyCosts: [{ month: '2026-09', amount: 0 }],
  categoryCosts: [],
  upcomingContracts: [],
}

const populatedData: DashboardData = {
  userDisplayName: 'Anna',
  currentMonthCost: 842,
  previousMonthCost: 300,
  currentMonthChangePercent: 180.7,
  currentYearCost: 1142,
  previousYearCost: 800,
  currentYearChangePercent: 42.75,
  monthlyCosts: [
    { month: '2026-08', amount: 300 },
    { month: '2026-09', amount: 842 },
  ],
  categoryCosts: [{ categoryId: 'heating', categoryName: 'Heizung', categoryIcon: '🔥', amount: 720 }],
  upcomingContracts: [
    {
      contractId: 'c1',
      categoryName: 'Internet',
      provider: 'Telekom',
      cancellationDate: '2026-10-12T00:00:00.000Z',
      daysRemaining: 26,
    },
  ],
  latestBill: {
    billId: 'b1',
    title: 'Jahresabrechnung 2025',
    totalAmount: 2486.4,
    balance: 184.2,
    balanceType: 'payment_due',
    importedAt: '2026-09-16T00:00:00.000Z',
  },
}

describe('DashboardPage', () => {
  beforeEach(() => {
    getDashboardDataMock.mockReset()
  })

  it('renders the dashboard header immediately, then resolves loading', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Kostenblick' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitForLoadingToFinish()
  })

  it('shows the empty states for every section when there is no data', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText(/Noch keine Kostendaten vorhanden\./)).toBeInTheDocument()
    expect(screen.getByText('Noch keine Kosten vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine anstehenden Vertragsfristen')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Nebenkostenabrechnung importiert.')).toBeInTheDocument()
  })

  it('renders real aggregated data when available', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText(/^Guten .*, Anna$/)).toBeInTheDocument()
    expect(screen.getByText(money(842))).toBeInTheDocument()
    expect(screen.getByText(money(1142))).toBeInTheDocument()
    expect(screen.getByText('Heizung')).toBeInTheDocument()
    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(screen.getByText('Jahresabrechnung 2025')).toBeInTheDocument()
  })

  it('shows an error state on failure and recovers via retry', async () => {
    getDashboardDataMock.mockRejectedValueOnce(new Error('boom'))
    getDashboardDataMock.mockResolvedValueOnce(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Die Kostendaten konnten nicht geladen werden.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    await waitForLoadingToFinish()

    expect(screen.getByText(money(842))).toBeInTheDocument()
    expect(getDashboardDataMock).toHaveBeenCalledTimes(2)
  })

  it('links every quick action to its correct route', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByRole('link', { name: '+ Abrechnung' })).toHaveAttribute('href', '#/abrechnungen')
    expect(screen.getByRole('link', { name: '+ Vertrag' })).toHaveAttribute('href', '#/vertraege')
    expect(screen.getByRole('link', { name: 'Kosten erfassen' })).toHaveAttribute('href', '#/statistik')
  })
})

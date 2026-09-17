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
  documentsSummary: { total: 0, needsReview: 0 },
  wasteCostsSummary: { year: 2026, total: 0, byCategory: [] },
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
  documentsSummary: { total: 3, needsReview: 1 },
  wasteCostsSummary: {
    year: 2026,
    total: 186.4,
    byCategory: [{ category: 'residual', amount: 186.4 }],
    previousYearTotal: 174.2,
    change: 12.2,
    changePercent: 7,
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

    expect(screen.getByRole('link', { name: '+ Abrechnung' })).toHaveAttribute('href', '#/abrechnungen/neu')
    expect(screen.getByRole('link', { name: '+ Vertrag' })).toHaveAttribute('href', '#/vertraege/neu')
    expect(screen.getByRole('link', { name: 'Kosten erfassen' })).toHaveAttribute('href', '#/kosten/neu')
  })

  it('links "Nächste Vertragsfristen" to the reminders page, not the contracts list', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Nächste Vertragsfristen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Alle Erinnerungen' })).toHaveAttribute('href', '#/erinnerungen')
  })

  it('shows the documents summary, including how many need review', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('3 Dokumente')).toBeInTheDocument()
    expect(screen.getByText('1 benötigen Prüfung')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Alle Dokumente' })).toHaveAttribute('href', '#/dokumente')
  })

  it('shows an empty documents state when there are none', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Noch keine Dokumente vorhanden.')).toBeInTheDocument()
  })

  it('shows the waste costs summary with the year-over-year change', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Müllkosten')).toBeInTheDocument()
    expect(screen.getByText(money(186.4))).toBeInTheDocument()
    expect(screen.getByText(/\+7,0 % gegenüber 2025/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Müllkosten anzeigen' })).toHaveAttribute('href', '#/muell')
  })

  it('shows an empty waste costs state when there are none for the current year', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText(/Noch keine Müllkosten für \d+ erfasst\./)).toBeInTheDocument()
  })

  it('links to the central cost overview and clarifies the waste card is already part of the totals above', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByRole('link', { name: 'Kostenübersicht →' })).toHaveAttribute('href', '#/kostenuebersicht')
    expect(screen.getByText('Bereits in den Jahreskosten oben enthalten.')).toBeInTheDocument()
  })
})

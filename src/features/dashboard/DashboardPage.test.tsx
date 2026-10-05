import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import type { DashboardData } from './dashboard.types'
import { DEFAULT_CATEGORIES } from '../../constants/categories'
import type { ImportBatch, Transaction } from '../../domain/models/entities'
import type { FinanceData } from '../../domain/usecases/finance/monthlyOverview'
import { formatCurrency } from '../../utils/formatters'

const { getDashboardDataMock, getFinanceDataMock } = vi.hoisted(() => ({
  getDashboardDataMock: vi.fn(),
  getFinanceDataMock: vi.fn(),
}))

vi.mock('../../domain/usecases/dashboard', () => ({
  getDashboardData: getDashboardDataMock,
}))

vi.mock('../../domain/usecases/finance/monthlyOverview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../domain/usecases/finance/monthlyOverview')>()),
  getFinanceData: getFinanceDataMock,
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
  upcomingContracts: [],
  documentsSummary: { total: 0, needsReview: 0 },
  runningContractCosts: { monthly: 0, yearly: 0 },
}

const populatedData: DashboardData = {
  userDisplayName: 'Anna',
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
  runningContractCosts: { monthly: 287.4, yearly: 3448.8 },
}

function booking(id: string, bookingDate: string, amount: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    accountId: 'giro',
    bookingDate,
    amount,
    currency: 'EUR',
    counterpartyName: `Gegenpartei ${id}`,
    purpose: '',
    bookingText: '',
    categorySource: 'rule',
    flowType: amount > 0 ? 'income' : 'expense',
    flowTypeSource: 'auto',
    importBatchId: 'b',
    dedupeKey: id,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

const batch: ImportBatch = {
  id: 'b',
  accountId: 'giro',
  filename: 'giro.csv',
  fileChecksum: '',
  importedAt: '',
  periodFrom: '2026-07-01',
  periodTo: '2026-08-31',
  counts: { total: 5, new: 5, duplicates: 0, skippedPending: 0 },
  createdAt: '',
  updatedAt: '',
}

const transactions = [
  booking('j1', '2026-07-01', 2500, { categoryId: 'salary' }),
  booking('j2', '2026-07-03', -1000, { categoryId: 'housing' }),
  booking('a1', '2026-08-01', 2850, { categoryId: 'salary', counterpartyName: 'Arbeitgeber' }),
  booking('a2', '2026-08-02', -750, { categoryId: 'housing', counterpartyName: 'Vermieter' }),
  booking('a3', '2026-08-12', -48.32, { categoryId: 'groceries', counterpartyName: 'Edeka' }),
  booking('a4', '2026-08-20', -300, { flowType: 'saving', categoryId: 'savings', counterpartyName: 'Tagesgeld' }),
  booking('a5', '2026-08-22', -20),
]

const financeData: FinanceData = {
  transactions,
  categories: DEFAULT_CATEGORIES,
  batches: [batch],
  months: ['2026-08', '2026-07'],
  defaultMonth: '2026-08',
}

const noFinanceData: FinanceData = { transactions: [], categories: DEFAULT_CATEGORIES, batches: [], months: [] }

describe('DashboardPage', () => {
  beforeEach(() => {
    getDashboardDataMock.mockReset()
    getFinanceDataMock.mockReset()
    getFinanceDataMock.mockResolvedValue(financeData)
  })

  it('renders the header immediately, then resolves loading', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    expect(screen.getByRole('heading', { name: 'Hallo!' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await waitForLoadingToFinish()
  })

  it('shows the month figures from the bookings (O-5) with the change to the previous month', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByRole('heading', { name: 'Hallo, Anna!' })).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveDisplayValue('August 2026')
    const kpis = within(screen.getByRole('region', { name: 'Kennzahlen' }))
    expect(kpis.getByText(money(2850))).toBeInTheDocument()
    expect(kpis.getByText(money(818.32))).toBeInTheDocument()
    expect(kpis.getByText(money(300))).toBeInTheDocument()
    // Saldo = 2.850 − 818,32 − 300
    expect(kpis.getByText(money(1731.68))).toBeInTheDocument()
    expect(kpis.getByText('↗ +14,0 % vs. Vormonat')).toBeInTheDocument()
    expect(kpis.getByText('↘ -18,2 % vs. Vormonat')).toBeInTheDocument()
  })

  it('shows category groups, recent bookings and a hint for uncategorized bookings', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    const groups = within(screen.getByRole('list', { name: 'Ausgaben nach Kategorie' }))
    expect(groups.getByText('Wohnen')).toBeInTheDocument()
    expect(groups.getByText('Lebensmittel')).toBeInTheDocument()
    expect(groups.getByText('Ohne Kategorie')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Edeka/ })).toHaveAttribute('href', '#/buchungen/a3')
    expect(screen.getByRole('link', { name: 'Alle anzeigen' })).toHaveAttribute('href', '#/buchungen?monat=2026-08')
    expect(screen.getByText(/1 Buchung ist noch ohne Kategorie/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zuordnen' })).toHaveAttribute('href', '#/buchungen?monat=2026-08&kategorie=ohne')
  })

  it('switches the month without reloading', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2026-07' } })
    const kpis = within(screen.getByRole('region', { name: 'Kennzahlen' }))
    expect(kpis.getByText(money(2500))).toBeInTheDocument()
    expect(kpis.getByText('Keine Buchungen im Vormonat – kein Vergleich.')).toBeInTheDocument()
    expect(getFinanceDataMock).toHaveBeenCalledTimes(1)
  })

  it('without bookings explains the import and links the cost overview', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    getFinanceDataMock.mockResolvedValue(noFinanceData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Noch keine Kontobewegungen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sparkassen-CSV importieren' })).toHaveAttribute('href', '#/buchungen/import')
    expect(screen.getByRole('link', { name: 'Erfasste Kosten in der Kostenübersicht' })).toHaveAttribute('href', '#/kostenuebersicht')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('never shows bill, waste or manual cost totals as money figures (E7)', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.queryByText('Müllkosten')).not.toBeInTheDocument()
    expect(screen.queryByText(/Jahreskosten/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Erfasste Kosten →' })).toHaveAttribute('href', '#/kostenuebersicht')
  })

  it('shows the household cards', async () => {
    getDashboardDataMock.mockResolvedValue(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Internet')).toBeInTheDocument()
    expect(screen.getByText('Jahresabrechnung 2025')).toBeInTheDocument()
    expect(screen.getByText('Nächste Vertragsfristen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Alle Erinnerungen' })).toHaveAttribute('href', '#/erinnerungen')
    expect(screen.getByText('3 Dokumente')).toBeInTheDocument()
    expect(screen.getByText('1 benötigen Prüfung')).toBeInTheDocument()
    expect(screen.getByText(`${money(287.4)} / Monat`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Soll/Ist ansehen' })).toHaveAttribute('href', '#/vertraege/fixkosten')
  })

  it('shows the empty household states', async () => {
    getDashboardDataMock.mockResolvedValue(emptyData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Keine anstehenden Vertragsfristen')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Nebenkostenabrechnung importiert.')).toBeInTheDocument()
    expect(screen.getByText('Noch keine Dokumente vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine aktiven Verträge mit laufenden Kosten.')).toBeInTheDocument()
  })

  it('shows an error state on failure and recovers via retry', async () => {
    getDashboardDataMock.mockRejectedValueOnce(new Error('boom'))
    getDashboardDataMock.mockResolvedValueOnce(populatedData)
    renderPage()
    await waitForLoadingToFinish()

    expect(screen.getByText('Die Kostendaten konnten nicht geladen werden.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    await waitForLoadingToFinish()

    expect(screen.getByText('Jahresabrechnung 2025')).toBeInTheDocument()
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
})

import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCostsByCategory,
  getDashboardData,
  getDocumentsSummary,
  getLatestBill,
  getMonthlyCosts,
  getUpcomingContractDeadlines,
  getYearlyCosts,
} from '../domain/usecases/dashboard'
import { deleteDatabase } from '../database/database'
import {
  billItemRepository,
  billRepository,
  contractRepository,
  costEntryRepository,
  documentRepository,
  wasteCostRepository,
} from '../domain/repositories/indexedDbRepositories'
import type { Bill, BillItem, Category, Contract, CostEntry, Document, WasteCost } from '../domain/models/entities'

const syncBase = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
}

const costEntry = (overrides: Partial<CostEntry> = {}): CostEntry => ({
  ...syncBase,
  id: 'ce-1',
  userId: 'u1',
  categoryId: 'heating',
  amount: 100,
  date: '2026-03-15T00:00:00.000Z',
  source: 'manual',
  ...overrides,
})

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  ...syncBase,
  id: 'c-1',
  userId: 'u1',
  categoryId: 'internet',
  provider: 'Provider GmbH',
  monthlyCost: 40,
  startDate: '2025-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: true,
  ...overrides,
})

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  ...syncBase,
  id: 'b-1',
  userId: 'u1',
  type: 'annual_statement',
  year: 2025,
  totalAmount: 2486.4,
  advancePayments: 2302.2,
  balance: 184.2,
  balanceType: 'payment_due',
  ...overrides,
})

const billItem = (overrides: Partial<BillItem> = {}): BillItem => ({
  ...syncBase,
  id: 'bi-1',
  billId: 'b-1',
  categoryId: 'heating',
  description: 'Position',
  amount: 0,
  confidence: 1,
  manuallyVerified: true,
  ...overrides,
})

const wasteCost = (overrides: Partial<WasteCost> = {}): WasteCost => ({
  ...syncBase,
  id: 'w-1',
  userId: 'u1',
  year: 2026,
  category: 'residual',
  amount: 0,
  ...overrides,
})

const document = (overrides: Partial<Document> = {}): Document => ({
  ...syncBase,
  id: 'doc-1',
  userId: 'u1',
  type: 'other',
  filename: 'doc.pdf',
  mimeType: 'application/pdf',
  size: 100,
  storagePath: 'storage-1',
  ocrStatus: 'not_started',
  ...overrides,
})

const categories: Category[] = [
  { id: 'heating', name: 'Heizung', icon: '🔥', type: 'both', createdAt: '', updatedAt: '' },
  { id: 'internet', name: 'Internet', icon: '🌐', type: 'both', createdAt: '', updatedAt: '' },
]

describe('getMonthlyCosts', () => {
  it('returns one entry per month up to the reference month, summing same-month entries', () => {
    const entries = [
      costEntry({ id: '1', date: '2026-01-10T00:00:00.000Z', amount: 50 }),
      costEntry({ id: '2', date: '2026-01-20T00:00:00.000Z', amount: 25 }),
      costEntry({ id: '3', date: '2026-02-05T00:00:00.000Z', amount: 80 }),
      costEntry({ id: '4', date: '2025-12-31T00:00:00.000Z', amount: 999 }),
    ]
    const result = getMonthlyCosts(entries, new Date('2026-02-15T00:00:00.000Z'))
    expect(result).toEqual([
      { month: '2026-01', amount: 75 },
      { month: '2026-02', amount: 80 },
    ])
  })
})

describe('getYearlyCosts', () => {
  it('sums only entries within the given year', () => {
    const entries = [
      costEntry({ id: '1', date: '2026-01-01T00:00:00.000Z', amount: 100 }),
      costEntry({ id: '2', date: '2026-12-31T00:00:00.000Z', amount: 50 }),
      costEntry({ id: '3', date: '2025-12-31T00:00:00.000Z', amount: 999 }),
    ]
    expect(getYearlyCosts(entries, 2026)).toBe(150)
  })
})

describe('getCostsByCategory', () => {
  it('groups and sorts by amount descending, joining category name/icon', () => {
    const entries = [
      costEntry({ id: '1', categoryId: 'internet', amount: 30, date: '2026-01-01T00:00:00.000Z' }),
      costEntry({ id: '2', categoryId: 'heating', amount: 100, date: '2026-01-01T00:00:00.000Z' }),
      costEntry({ id: '3', categoryId: 'heating', amount: 20, date: '2026-01-01T00:00:00.000Z' }),
    ]
    expect(getCostsByCategory(entries, categories, 2026)).toEqual([
      { categoryId: 'heating', categoryName: 'Heizung', categoryIcon: '🔥', amount: 120 },
      { categoryId: 'internet', categoryName: 'Internet', categoryIcon: '🌐', amount: 30 },
    ])
  })

  it('excludes entries from other years', () => {
    const entries = [costEntry({ date: '2024-01-01T00:00:00.000Z' })]
    expect(getCostsByCategory(entries, categories, 2026)).toEqual([])
  })
})

describe('getUpcomingContractDeadlines', () => {
  const now = new Date('2026-09-16T00:00:00.000Z')

  it('only includes future deadlines, sorted soonest first', () => {
    const contracts = [
      contract({ id: 'past', calculatedCancellationDate: '2026-01-01T00:00:00.000Z' }),
      contract({ id: 'later', categoryId: 'internet', calculatedCancellationDate: '2026-11-03T00:00:00.000Z' }),
      contract({ id: 'soon', categoryId: 'internet', calculatedCancellationDate: '2026-10-12T00:00:00.000Z' }),
      contract({ id: 'none' }),
    ]
    const result = getUpcomingContractDeadlines(contracts, categories, now)
    expect(result.map((d) => d.contractId)).toEqual(['soon', 'later'])
    expect(result[0]?.categoryName).toBe('Internet')
    expect(result[0]?.daysRemaining).toBe(26)
  })

  it('respects the limit', () => {
    const contracts = Array.from({ length: 10 }, (_, i) =>
      contract({ id: `c${i}`, calculatedCancellationDate: `2026-10-${10 + i}T00:00:00.000Z` }),
    )
    expect(getUpcomingContractDeadlines(contracts, categories, now, 3)).toHaveLength(3)
  })
})

describe('getLatestBill', () => {
  it('returns undefined when there are no bills', () => {
    expect(getLatestBill([])).toBeUndefined()
  })

  it('picks the bill with the latest periodEnd/createdAt and formats a summary', () => {
    const bills = [
      bill({ id: 'old', year: 2024, periodEnd: '2024-12-31T00:00:00.000Z' }),
      bill({ id: 'new', year: 2025, periodEnd: '2025-12-31T00:00:00.000Z' }),
    ]
    const summary = getLatestBill(bills)
    expect(summary?.billId).toBe('new')
    expect(summary?.title).toBe('Jahresabrechnung 2025')
    expect(summary?.balance).toBe(184.2)
  })
})

describe('getDocumentsSummary', () => {
  it('counts total documents and how many need review', () => {
    const documents = [
      document({ id: 'd1', ocrStatus: 'verified' }),
      document({ id: 'd2', ocrStatus: 'needs_review' }),
      document({ id: 'd3', ocrStatus: 'needs_review' }),
      document({ id: 'd4', ocrStatus: 'not_started' }),
    ]
    expect(getDocumentsSummary(documents)).toEqual({ total: 4, needsReview: 2 })
  })

  it('returns zeroes for an empty list', () => {
    expect(getDocumentsSummary([])).toEqual({ total: 0, needsReview: 0 })
  })
})

describe('getDashboardData (integration against IndexedDB)', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('returns an empty-but-valid shape when the database has no data', async () => {
    const data = await getDashboardData(new Date('2026-09-16T00:00:00.000Z'))
    expect(data.currentMonthCost).toBe(0)
    expect(data.currentYearCost).toBe(0)
    expect(data.previousYearCost).toBeUndefined()
    expect(data.currentYearChangePercent).toBeNull()
    expect(data.categoryCosts).toEqual([])
    expect(data.upcomingContracts).toEqual([])
    expect(data.latestBill).toBeUndefined()
    expect(data.documentsSummary).toEqual({ total: 0, needsReview: 0 })
    expect(data.currentYearWarnings).toEqual([])
  })

  it('exposes a possible-duplicate warning for the current year, reusing detectCostAggregationWarnings - without reducing currentYearCost', async () => {
    const currentYearBill = await billRepository.save(bill({ id: 'b-2026', year: 2026, totalAmount: 1000 }))
    await billItemRepository.save(billItem({ id: 'bi-waste', billId: currentYearBill.id, categoryId: 'waste', amount: 100 }))
    await wasteCostRepository.save(wasteCost({ id: 'w-2026', year: 2026, amount: 100 }))

    const data = await getDashboardData(new Date('2026-09-16T00:00:00.000Z'))

    // Bill.totalAmount (1000) + WasteCost (100), never deduplicated - the
    // warning signals a *possible* overlap, it never alters the total.
    expect(data.currentYearCost).toBe(1100)
    expect(data.currentYearWarnings).toHaveLength(1)
    expect(data.currentYearWarnings[0]?.type).toBe('possible_duplicate_waste')
  })

  it('aggregates real repository data', async () => {
    await costEntryRepository.save(costEntry({ id: 'ce-a', date: '2026-09-01T00:00:00.000Z', amount: 200 }))
    await costEntryRepository.save(costEntry({ id: 'ce-b', date: '2025-09-01T00:00:00.000Z', amount: 100 }))
    await contractRepository.save(contract({ calculatedCancellationDate: '2026-12-01T00:00:00.000Z' }))
    await billRepository.save(bill())
    await documentRepository.save(document({ id: 'd1', ocrStatus: 'needs_review' }))

    const data = await getDashboardData(new Date('2026-09-16T00:00:00.000Z'))
    expect(data.currentMonthCost).toBe(200)
    // 2026 has no Bill/WasteCost, only the ce-a CostEntry -> 200, same as before.
    expect(data.currentYearCost).toBe(200)
    // Phase 9: previousYearCost (2025) now combines Bill.totalAmount (the
    // default bill() fixture below, year 2025, 2486.4) with the manual
    // ce-b CostEntry (100) via the central cost projection - no longer
    // CostEntry-only, since the Dashboard's headline cards now read from
    // the same pipeline as /kostenuebersicht (see dashboard.ts).
    expect(data.previousYearCost).toBe(2586.4)
    expect(data.currentYearChangePercent).toBeCloseTo(((200 - 2586.4) / 2586.4) * 100, 5)
    expect(data.upcomingContracts).toHaveLength(1)
    expect(data.latestBill?.billId).toBe('b-1')
    expect(data.documentsSummary).toEqual({ total: 1, needsReview: 1 })
  })
})

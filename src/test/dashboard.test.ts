import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCostsByCategory,
  getDashboardData,
  getLatestBill,
  getMonthlyCosts,
  getUpcomingContractDeadlines,
  getYearlyCosts,
} from '../domain/usecases/dashboard'
import { deleteDatabase } from '../database/database'
import {
  billRepository,
  contractRepository,
  costEntryRepository,
} from '../domain/repositories/indexedDbRepositories'
import type { Bill, Category, Contract, CostEntry } from '../domain/models/entities'

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
  })

  it('aggregates real repository data', async () => {
    await costEntryRepository.save(costEntry({ id: 'ce-a', date: '2026-09-01T00:00:00.000Z', amount: 200 }))
    await costEntryRepository.save(costEntry({ id: 'ce-b', date: '2025-09-01T00:00:00.000Z', amount: 100 }))
    await contractRepository.save(contract({ calculatedCancellationDate: '2026-12-01T00:00:00.000Z' }))
    await billRepository.save(bill())

    const data = await getDashboardData(new Date('2026-09-16T00:00:00.000Z'))
    expect(data.currentMonthCost).toBe(200)
    expect(data.currentYearCost).toBe(200)
    expect(data.previousYearCost).toBe(100)
    expect(data.currentYearChangePercent).toBe(100)
    expect(data.upcomingContracts).toHaveLength(1)
    expect(data.latestBill?.billId).toBe('b-1')
  })
})

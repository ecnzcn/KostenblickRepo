import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  billItemRepository,
  billRepository,
} from '../domain/repositories/indexedDbRepositories'
import type { Bill, BillItem, Category } from '../domain/models/entities'
import {
  buildStatisticsData,
  calculateStatisticsSummary,
  calculateYearlyTotal,
  calculateYearStatistics,
  detectBillItemsDiscrepancy,
  getAvailableYears,
  getStatisticsData,
} from '../domain/usecases/statistics/calculateStatistics'
import { calculateCategoryStatistics } from '../domain/usecases/statistics/calculateCategoryStatistics'
import { calculateYearOverYearChange } from '../domain/usecases/statistics/calculateYearComparison'
import { calculateAverageMonthlyCost, calculateMonthlyStatistics } from '../domain/usecases/statistics/calculateMonthlyStatistics'

const syncBase = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
}

let billSeq = 0
let itemSeq = 0

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  ...syncBase,
  id: `b-${(billSeq += 1)}`,
  userId: 'u1',
  type: 'annual_statement',
  year: 2026,
  totalAmount: 0,
  advancePayments: 0,
  balance: 0,
  balanceType: 'none',
  ...overrides,
})

const billItem = (billId: string, overrides: Partial<BillItem> = {}): BillItem => ({
  ...syncBase,
  id: `bi-${(itemSeq += 1)}`,
  billId,
  categoryId: 'heating',
  description: 'Position',
  amount: 0,
  confidence: 1,
  manuallyVerified: true,
  ...overrides,
})

const categories: Category[] = [
  { id: 'heating', name: 'Heizung', icon: '🔥', type: 'both', createdAt: '', updatedAt: '' },
  { id: 'water', name: 'Wasser', icon: '💧', type: 'both', createdAt: '', updatedAt: '' },
  { id: 'waste', name: 'Müll', icon: '🗑️', type: 'both', createdAt: '', updatedAt: '' },
]

// Test 1: yearly total sum (2026: 100+200+300=600€)
describe('calculateYearlyTotal', () => {
  it('sums Bill.totalAmount for the given year only', () => {
    const bills = [
      bill({ id: 'a', year: 2026, totalAmount: 100 }),
      bill({ id: 'b', year: 2026, totalAmount: 200 }),
      bill({ id: 'c', year: 2026, totalAmount: 300 }),
      bill({ id: 'd', year: 2025, totalAmount: 999 }),
    ]
    expect(calculateYearlyTotal(bills, 2026)).toBe(600)
  })
})

// Test 2: YoY comparison (2025=1000€, 2026=1200€ -> diff=200€, pct=20%)
describe('calculateYearOverYearChange', () => {
  it('computes difference and percentage', () => {
    const result = calculateYearOverYearChange(1200, 1000)
    expect(result.change).toBe(200)
    expect(result.percent).toBeCloseTo(20)
  })

  // Test 3: previous year = 0 -> percentage undefined/null, no division by zero
  it('returns null percent (never Infinity/NaN) when the previous year is 0', () => {
    const result = calculateYearOverYearChange(500, 0)
    expect(result.change).toBe(500)
    expect(result.percent).toBeNull()
    expect(Number.isFinite(result.percent ?? 0)).toBe(true)
  })

  it('returns undefined change/percent when there is no previous year at all', () => {
    const result = calculateYearOverYearChange(500, undefined)
    expect(result.change).toBeUndefined()
    expect(result.percent).toBeUndefined()
  })
})

// Test 4 + 5: categories (Heizung=600€, Wasser=300€, Müll=100€ -> 60%/30%/10%), largest first
describe('calculateCategoryStatistics', () => {
  it('groups by category and computes percentages of the itemized total', () => {
    const items = [
      billItem('b1', { categoryId: 'heating', amount: 600 }),
      billItem('b1', { categoryId: 'water', amount: 300 }),
      billItem('b1', { categoryId: 'waste', amount: 100 }),
    ]
    const result = calculateCategoryStatistics(items, categories)
    expect(result.map((r) => r.categoryName)).toEqual(['Heizung', 'Wasser', 'Müll'])
    expect(result[0]).toMatchObject({ categoryName: 'Heizung', amount: 600, percentage: 60 })
    expect(result[1]).toMatchObject({ categoryName: 'Wasser', amount: 300, percentage: 30 })
    expect(result[2]).toMatchObject({ categoryName: 'Müll', amount: 100, percentage: 10 })
  })

  it('groups items without a categoryId under "Nicht zugeordnet" instead of dropping them', () => {
    const items = [billItem('b1', { categoryId: undefined, amount: 50 })]
    const result = calculateCategoryStatistics(items, categories)
    expect(result).toHaveLength(1)
    expect(result[0]?.categoryName).toBe('Nicht zugeordnet')
    expect(result[0]?.categoryId).toBeUndefined()
  })
})

// Test 6: no double counting - Bill totalAmount=1000€ with BillItems 600€+400€
// must show 1.000€, not 2.000€
describe('calculateStatisticsSummary (no double counting)', () => {
  it('never adds Bill.totalAmount and the sum of BillItems together', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [
      billItem('b1', { categoryId: 'heating', amount: 600 }),
      billItem('b1', { categoryId: 'water', amount: 400 }),
    ]
    const summary = calculateStatisticsSummary(bills, items, 2026)
    expect(summary.totalAmount).toBe(1000)
    expect(summary.itemizedAmount).toBe(1000)
    expect(summary.unassignedDifference).toBe(0)
  })

  // Test 7: Bill vs Items difference (Bill=1000€, Items=900€ -> bill total=1000€,
  // item total=900€, difference=100€)
  it('surfaces a Bill-vs-Items discrepancy instead of silently reconciling it', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'heating', amount: 900 })]
    const summary = calculateStatisticsSummary(bills, items, 2026)
    expect(summary.totalAmount).toBe(1000)
    expect(summary.itemizedAmount).toBe(900)
    expect(summary.unassignedDifference).toBe(100)

    const discrepancy = detectBillItemsDiscrepancy(bills[0]!, items)
    expect(discrepancy).toEqual({ billId: 'b1', billTotal: 1000, itemsTotal: 900, difference: 100 })
  })
})

// Test 8: multiple years aggregate correctly
describe('calculateYearStatistics / getAvailableYears', () => {
  it('aggregates one total per year across multiple years', () => {
    const bills = [
      bill({ id: 'a', year: 2024, totalAmount: 500 }),
      bill({ id: 'b', year: 2025, totalAmount: 1000 }),
      bill({ id: 'c', year: 2025, totalAmount: 200 }),
      bill({ id: 'd', year: 2026, totalAmount: 1200 }),
    ]
    expect(getAvailableYears(bills)).toEqual([2024, 2025, 2026])
    expect(calculateYearStatistics(bills)).toEqual([
      { year: 2024, amount: 500 },
      { year: 2025, amount: 1200 },
      { year: 2026, amount: 1200 },
    ])
  })
})

// Test 9 + 10: monthly data uses only actually-present months, no artificial distribution
describe('calculateMonthlyStatistics', () => {
  it('attributes a bill to a month only when its period is fully within that one month', () => {
    const bills = [
      bill({
        id: 'monthly',
        year: 2026,
        totalAmount: 80,
        periodStart: '2026-03-01T00:00:00.000Z',
        periodEnd: '2026-03-31T00:00:00.000Z',
      }),
    ]
    const result = calculateMonthlyStatistics(bills, 2026)
    expect(result).toHaveLength(12)
    const march = result.find((m) => m.month === '2026-03')
    expect(march).toEqual({ month: '2026-03', amount: 80, hasActualData: true })
    const others = result.filter((m) => m.month !== '2026-03')
    expect(others.every((m) => m.hasActualData === false && m.amount === 0)).toBe(true)
  })

  it('never spreads an annual bill evenly across 12 months', () => {
    const bills = [
      bill({
        id: 'annual',
        year: 2026,
        totalAmount: 1200,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-12-31T00:00:00.000Z',
      }),
    ]
    const result = calculateMonthlyStatistics(bills, 2026)
    expect(result.every((m) => m.hasActualData === false)).toBe(true)
    expect(result.every((m) => m.amount === 0)).toBe(true)
  })

  it('leaves months with no attributable bill untouched when a bill has no period dates at all', () => {
    const bills = [bill({ id: 'no-period', year: 2026, totalAmount: 500 })]
    const result = calculateMonthlyStatistics(bills, 2026)
    expect(result.every((m) => m.hasActualData === false)).toBe(true)
  })

  it('averages only over months with real data, not yearTotal/12', () => {
    const monthly = [
      { month: '2026-01', amount: 100, hasActualData: true },
      { month: '2026-02', amount: 300, hasActualData: true },
      { month: '2026-03', amount: 0, hasActualData: false },
    ]
    expect(calculateAverageMonthlyCost(monthly)).toBe(200)
    expect(calculateAverageMonthlyCost(monthly.map((m) => ({ ...m, hasActualData: false })))).toBeUndefined()
  })
})

// Test 11: empty database -> no crash
describe('buildStatisticsData (empty input)', () => {
  it('returns a valid, empty-but-safe shape with no bills at all', () => {
    const data = buildStatisticsData([], [], categories, 2026)
    expect(data.years).toEqual([])
    expect(data.summary).toEqual({
      year: 2026,
      totalAmount: 0,
      itemizedAmount: 0,
      unassignedDifference: 0,
      billCount: 0,
      previousYearAmount: undefined,
      yearOverYearChange: undefined,
      yearOverYearChangePercent: undefined,
    })
    expect(data.categories).toEqual([])
    expect(data.topCostPositions).toEqual([])
    expect(data.hasMonthlyData).toBe(false)
    expect(data.averageMonthlyCost).toBeUndefined()
  })
})

// Test 12: invalid values -> no NaN/Infinity anywhere in the results
describe('buildStatisticsData (defensive against bad data)', () => {
  it('never produces NaN or Infinity, even with a zero previous year and zero-total categories', () => {
    const bills = [
      bill({ id: 'y1', year: 2025, totalAmount: 0 }),
      bill({ id: 'y2', year: 2026, totalAmount: 400 }),
    ]
    const items = [billItem('y2', { categoryId: undefined, amount: 400 })]
    const data = buildStatisticsData(bills, items, categories, 2026)

    const assertFinite = (value: unknown) => {
      if (typeof value === 'number') {
        expect(Number.isNaN(value)).toBe(false)
        expect(Number.isFinite(value)).toBe(true)
      }
    }
    assertFinite(data.summary.totalAmount)
    assertFinite(data.summary.unassignedDifference)
    assertFinite(data.summary.yearOverYearChange)
    // previous year is 0 -> percent must be null, never NaN/Infinity
    expect(data.summary.yearOverYearChangePercent).toBeNull()
    for (const category of data.categories) assertFinite(category.percentage)
    for (const position of data.topCostPositions) assertFinite(position.percentage)
  })
})

// Integration test: IndexedDB fixtures -> statistics use case
describe('getStatisticsData (integration against IndexedDB)', () => {
  beforeEach(async () => {
    await deleteDatabase()
    billSeq = 0
    itemSeq = 0
  })

  it('returns an empty-but-valid shape when the database has no data', async () => {
    const data = await getStatisticsData(2026)
    expect(data.years).toEqual([])
    expect(data.summary.totalAmount).toBe(0)
    expect(data.categories).toEqual([])
  })

  it('loads bills/items/categories once and aggregates them consistently', async () => {
    const savedBill = await billRepository.save(bill({ year: 2026, totalAmount: 1000 }))
    await billItemRepository.save(billItem(savedBill.id, { categoryId: 'heating', amount: 600 }))
    await billItemRepository.save(billItem(savedBill.id, { categoryId: 'water', amount: 300 }))

    const previousYearBill = await billRepository.save(bill({ year: 2025, totalAmount: 800 }))
    await billItemRepository.save(billItem(previousYearBill.id, { categoryId: 'heating', amount: 800 }))

    const data = await getStatisticsData(2026)
    expect(data.years).toEqual([2025, 2026])
    expect(data.summary.totalAmount).toBe(1000)
    expect(data.summary.itemizedAmount).toBe(900)
    expect(data.summary.unassignedDifference).toBe(100)
    expect(data.summary.previousYearAmount).toBe(800)
    expect(data.summary.yearOverYearChange).toBe(200)
    expect(data.summary.yearOverYearChangePercent).toBe(25)
    expect(data.categories[0]).toMatchObject({ categoryName: 'Heizung', amount: 600 })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  billItemRepository,
  billRepository,
  contractRepository,
  costEntryRepository,
  wasteCostRepository,
} from '../domain/repositories/indexedDbRepositories'
import type { Bill, BillItem, Category, Contract, CostEntry, WasteCost } from '../domain/models/entities'
import {
  buildCentralCostData,
  buildCentralCostItems,
  CENTRAL_WASTE_CATEGORY_ID,
  detectCostAggregationWarnings,
  getCentralCostData,
  getCentralCosts,
  getCentralCostsByCategory,
  getCentralCostsByMonth,
  getCentralCostsByYear,
  getCentralCostSummary,
  getCentralCostYears,
} from '../domain/usecases/centralCosts'

const syncBase = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
}

let billSeq = 0
let itemSeq = 0
let wasteSeq = 0
let costSeq = 0

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
  ocrStatus: 'not_started',
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

const wasteCost = (overrides: Partial<WasteCost> = {}): WasteCost => ({
  ...syncBase,
  id: `w-${(wasteSeq += 1)}`,
  userId: 'u1',
  year: 2026,
  category: 'residual',
  amount: 0,
  ...overrides,
})

const costEntry = (overrides: Partial<CostEntry> = {}): CostEntry => ({
  ...syncBase,
  id: `ce-${(costSeq += 1)}`,
  userId: 'u1',
  categoryId: 'heating',
  amount: 0,
  date: '2026-01-01T00:00:00.000Z',
  source: 'manual',
  ...overrides,
})

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  ...syncBase,
  id: 'c-1',
  userId: 'u1',
  categoryId: 'heating',
  provider: 'Provider GmbH',
  monthlyCost: 999,
  startDate: '2025-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: false,
  ...overrides,
})

const categories: Category[] = [
  { id: 'heating', name: 'Heizung', icon: '🔥', type: 'both', createdAt: '', updatedAt: '' },
  { id: 'water', name: 'Wasser', icon: '💧', type: 'both', createdAt: '', updatedAt: '' },
  { id: 'waste', name: 'Müll', icon: '🗑️', type: 'both', createdAt: '', updatedAt: '' },
]

describe('buildCentralCostItems', () => {
  it('maps a Bill to exactly one item at Bill.totalAmount, never its BillItems', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = buildCentralCostItems(bills, [], [])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: 'bill', amount: 1000, year: 2026, sourceEntityId: 'b1' })
  })

  it('maps a WasteCost to the central waste category while keeping the original WasteCategory', () => {
    const wasteCosts = [wasteCost({ id: 'w1', year: 2026, category: 'residual', amount: 240 })]
    const items = buildCentralCostItems([], wasteCosts, [])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'waste',
      amount: 240,
      categoryId: CENTRAL_WASTE_CATEGORY_ID,
      wasteCategory: 'residual',
      sourceEntityId: 'w1',
    })
  })

  it('maps a CostEntry without a billId to a manual item', () => {
    const entries = [costEntry({ id: 'ce1', amount: 42, categoryId: 'heating' })]
    const items = buildCentralCostItems([], [], entries)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: 'manual', amount: 42, categoryId: 'heating', sourceEntityId: 'ce1' })
  })

  it('excludes a CostEntry that already has a billId - it is already represented by that Bill', () => {
    const entries = [costEntry({ id: 'ce1', amount: 42, billId: 'some-bill' })]
    const items = buildCentralCostItems([], [], entries)
    expect(items).toEqual([])
  })

  it('never marks any current item as an estimate', () => {
    const items = buildCentralCostItems(
      [bill({ totalAmount: 100 })],
      [wasteCost({ amount: 50 })],
      [costEntry({ amount: 10 })],
    )
    expect(items.every((item) => item.isEstimate === false)).toBe(true)
  })
})

describe('getCentralCostsByYear', () => {
  it('filters items to the given year', () => {
    const items = buildCentralCostItems(
      [bill({ id: 'b1', year: 2026, totalAmount: 100 }), bill({ id: 'b2', year: 2025, totalAmount: 200 })],
      [],
      [],
    )
    expect(getCentralCostsByYear(items, 2026).map((item) => item.sourceEntityId)).toEqual(['b1'])
  })
})

describe('getCentralCostYears', () => {
  it('unions years across Bill, WasteCost and CostEntry, ascending, deduplicated', () => {
    const bills = [bill({ year: 2025 }), bill({ year: 2026 })]
    const wasteCosts = [wasteCost({ year: 2026 })]
    const entries = [costEntry({ date: '2024-06-01T00:00:00.000Z' })]
    expect(getCentralCostYears(bills, wasteCosts, entries)).toEqual([2024, 2025, 2026])
  })
})

describe('getCentralCostsByMonth', () => {
  it('attributes a CostEntry to its own month via date', () => {
    const entries = [costEntry({ amount: 50, date: '2026-03-15T00:00:00.000Z' })]
    const monthly = getCentralCostsByMonth([], entries, 2026)
    const march = monthly.find((m) => m.month === '2026-03')
    expect(march).toEqual({ month: '2026-03', amount: 50, hasActualData: true })
  })

  it('never spreads a WasteCost across months - WasteCost never appears in the monthly view at all', () => {
    // getCentralCostsByMonth intentionally takes no WasteCost parameter -
    // this test documents that fact structurally: passing none/zero bills
    // and CostEntries yields an all-empty monthly view regardless of how
    // much WasteCost data exists elsewhere for the year.
    const monthly = getCentralCostsByMonth([], [], 2026)
    expect(monthly.every((m) => m.hasActualData === false && m.amount === 0)).toBe(true)
  })

  it('attributes a Bill to a month only when its period is fully within that month', () => {
    const bills = [
      bill({ totalAmount: 80, periodStart: '2026-03-01T00:00:00.000Z', periodEnd: '2026-03-31T00:00:00.000Z' }),
    ]
    const monthly = getCentralCostsByMonth(bills, [], 2026)
    expect(monthly.find((m) => m.month === '2026-03')).toEqual({ month: '2026-03', amount: 80, hasActualData: true })
  })

  it('never spreads an annual Bill evenly across 12 months', () => {
    const bills = [
      bill({ totalAmount: 1200, periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T00:00:00.000Z' }),
    ]
    const monthly = getCentralCostsByMonth(bills, [], 2026)
    expect(monthly.every((m) => m.hasActualData === false && m.amount === 0)).toBe(true)
  })

  it('excludes a Bill-linked CostEntry from the monthly view - it is already counted via its Bill', () => {
    const entries = [costEntry({ amount: 999, date: '2026-05-01T00:00:00.000Z', billId: 'linked-bill' })]
    const monthly = getCentralCostsByMonth([], entries, 2026)
    expect(monthly.every((m) => m.hasActualData === false)).toBe(true)
  })
})

describe('getCentralCostsByCategory', () => {
  it('groups BillItems, WasteCost (under the central waste category) and manual CostEntries together', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'heating', amount: 600 })]
    const wasteCosts = [wasteCost({ year: 2026, amount: 100 })]
    const entries = [costEntry({ categoryId: 'water', amount: 50, date: '2026-01-01T00:00:00.000Z' })]

    const result = getCentralCostsByCategory(bills, items, wasteCosts, entries, categories, 2026)

    expect(result).toEqual([
      { categoryId: 'heating', categoryName: 'Heizung', categoryIcon: '🔥', amount: 600, percentage: (600 / 750) * 100 },
      { categoryId: 'waste', categoryName: 'Müll', categoryIcon: '🗑️', amount: 100, percentage: (100 / 750) * 100 },
      { categoryId: 'water', categoryName: 'Wasser', categoryIcon: '💧', amount: 50, percentage: (50 / 750) * 100 },
    ])
  })

  it('excludes a Bill-linked CostEntry from the category breakdown', () => {
    const entries = [costEntry({ categoryId: 'water', amount: 50, billId: 'linked-bill' })]
    const result = getCentralCostsByCategory([], [], [], entries, categories, 2026)
    expect(result).toEqual([])
  })
})

describe('detectCostAggregationWarnings', () => {
  it('warns when a Bill contains a waste-categorized BillItem and a WasteCost exists for the same year', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'waste', amount: 100 })]
    const wasteCosts = [wasteCost({ year: 2026, amount: 100 })]

    const warnings = detectCostAggregationWarnings(bills, items, wasteCosts, [], 2026)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.type).toBe('possible_duplicate_waste')
    expect(warnings[0]?.year).toBe(2026)
  })

  it('warns when a manual CostEntry is waste-categorized and a WasteCost exists for the same year', () => {
    const wasteCosts = [wasteCost({ year: 2026, amount: 100 })]
    const entries = [costEntry({ categoryId: 'waste', amount: 80, date: '2026-04-01T00:00:00.000Z' })]

    const warnings = detectCostAggregationWarnings([], [], wasteCosts, entries, 2026)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.type).toBe('possible_duplicate_manual_entry')
  })

  it('produces no warning when there is no WasteCost for the year at all', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'waste', amount: 100 })]
    expect(detectCostAggregationWarnings(bills, items, [], [], 2026)).toEqual([])
  })

  it('produces no warning when nothing waste-categorized exists outside WasteCost', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'heating', amount: 100 })]
    const wasteCosts = [wasteCost({ year: 2026, amount: 100 })]
    expect(detectCostAggregationWarnings(bills, items, wasteCosts, [], 2026)).toEqual([])
  })

  it('never removes or alters any amount - only reports', () => {
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = [billItem('b1', { categoryId: 'waste', amount: 100 })]
    const wasteCosts = [wasteCost({ id: 'w1', year: 2026, amount: 100 })]

    detectCostAggregationWarnings(bills, items, wasteCosts, [], 2026)

    // The source arrays themselves must be untouched by the detection call.
    expect(bills[0]?.totalAmount).toBe(1000)
    expect(wasteCosts[0]?.amount).toBe(100)
  })
})

describe('getCentralCostSummary (no blind summation, explicit duplicate signalling)', () => {
  it('sums bill + waste + manual, but never silently claims this is certainly correct when they might overlap', () => {
    // Bill.totalAmount = 1000 (incl. a 100€ waste BillItem) + WasteCost 100€
    // must NOT be silently presented as a confirmed 1100€ - a warning must
    // accompany the summary instead.
    const bills = [bill({ id: 'b1', year: 2026, totalAmount: 1000 })]
    const items = buildCentralCostItems(bills, [wasteCost({ year: 2026, amount: 100 })], [])
    const monthly = getCentralCostsByMonth(bills, [], 2026)
    const billItems = [billItem('b1', { categoryId: 'waste', amount: 100 })]
    const warnings = detectCostAggregationWarnings(bills, billItems, [wasteCost({ year: 2026, amount: 100 })], [], 2026)

    const summary = getCentralCostSummary(items, monthly, warnings, 2026)

    expect(summary.totalAmount).toBe(1100)
    expect(summary.billAmount).toBe(1000)
    expect(summary.wasteAmount).toBe(100)
    expect(warnings.length).toBeGreaterThan(0)
    expect(summary.possibleDuplicateCount).toBeGreaterThan(0)
    expect(summary.warnings).toEqual(warnings)
  })

  it('computes billAmount/wasteAmount/manualAmount independently and totals them', () => {
    const items = buildCentralCostItems(
      [bill({ totalAmount: 500, year: 2026 })],
      [wasteCost({ amount: 100, year: 2026 })],
      [costEntry({ amount: 40, date: '2026-02-01T00:00:00.000Z' })],
    )
    const summary = getCentralCostSummary(items, [], [], 2026)
    expect(summary.billAmount).toBe(500)
    expect(summary.wasteAmount).toBe(100)
    expect(summary.manualAmount).toBe(40)
    expect(summary.totalAmount).toBe(640)
    expect(summary.possibleDuplicateCount).toBe(0)
  })

  it('separates monthlyAttributedTotal from unallocatedForMonthView - WasteCost and non-attributable Bills never inflate the monthly-attributed figure', () => {
    const bills = [bill({ totalAmount: 1200, year: 2026, periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T00:00:00.000Z' })]
    const wasteCosts = [wasteCost({ amount: 240, year: 2026 })]
    const items = buildCentralCostItems(bills, wasteCosts, [])
    const monthly = getCentralCostsByMonth(bills, [], 2026)

    const summary = getCentralCostSummary(items, monthly, [], 2026)
    expect(summary.totalAmount).toBe(1440)
    expect(summary.monthlyAttributedTotal).toBe(0)
    expect(summary.unallocatedForMonthView).toBe(1440)
    expect(summary.monthlyDataAvailable).toBe(false)
  })

  it('reports a real monthlyAverage only from months with actual data', () => {
    const entries = [
      costEntry({ amount: 100, date: '2026-01-05T00:00:00.000Z' }),
      costEntry({ amount: 300, date: '2026-02-05T00:00:00.000Z' }),
    ]
    const items = buildCentralCostItems([], [], entries)
    const monthly = getCentralCostsByMonth([], entries, 2026)
    const summary = getCentralCostSummary(items, monthly, [], 2026)
    expect(summary.monthlyAverage).toBe(200)
    expect(summary.monthlyDataAvailable).toBe(true)
  })
})

describe('buildCentralCostData (defensive against empty/invalid input)', () => {
  it('returns a valid, empty-but-safe shape with no data at all', () => {
    const data = buildCentralCostData([], [], [], [], categories, 2026)
    expect(data.years).toEqual([])
    expect(data.summary.totalAmount).toBe(0)
    expect(data.summary.possibleDuplicateCount).toBe(0)
    expect(data.categories).toEqual([])
    expect(data.warnings).toEqual([])
    expect(data.sourceBreakdown).toEqual([
      { source: 'bill', amount: 0, count: 0 },
      { source: 'waste', amount: 0, count: 0 },
      { source: 'manual', amount: 0, count: 0 },
    ])
  })

  it('never produces NaN or Infinity, even with a zero-total year mixed with real data', () => {
    const bills = [bill({ id: 'b1', year: 2025, totalAmount: 0 }), bill({ id: 'b2', year: 2026, totalAmount: 400 })]
    const data = buildCentralCostData(bills, [], [], [], categories, 2026)

    const assertFinite = (value: unknown) => {
      if (typeof value === 'number') {
        expect(Number.isNaN(value)).toBe(false)
        expect(Number.isFinite(value)).toBe(true)
      }
    }
    assertFinite(data.summary.totalAmount)
    assertFinite(data.summary.unallocatedForMonthView)
    for (const category of data.categories) assertFinite(category.percentage)
  })
})

describe('getCentralCostData / getCentralCosts (integration against IndexedDB)', () => {
  beforeEach(async () => {
    await deleteDatabase()
    billSeq = 0
    itemSeq = 0
    wasteSeq = 0
    costSeq = 0
  })

  it('returns an empty-but-valid shape when the database has no data', async () => {
    const data = await getCentralCostData(2026)
    expect(data.years).toEqual([])
    expect(data.summary.totalAmount).toBe(0)
  })

  it('loads Bill/WasteCost/CostEntry once and combines them consistently, with the documented duplicate warning', async () => {
    const savedBill = await billRepository.save(bill({ year: 2026, totalAmount: 1000 }))
    await billItemRepository.save(billItem(savedBill.id, { categoryId: 'waste', amount: 100 }))
    await wasteCostRepository.save(wasteCost({ year: 2026, amount: 100 }))
    await costEntryRepository.save(costEntry({ amount: 40, date: '2026-06-01T00:00:00.000Z', categoryId: 'water' }))

    const data = await getCentralCostData(2026)
    expect(data.summary.billAmount).toBe(1000)
    expect(data.summary.wasteAmount).toBe(100)
    expect(data.summary.manualAmount).toBe(40)
    expect(data.summary.totalAmount).toBe(1140)
    expect(data.summary.warnings.some((w) => w.type === 'possible_duplicate_waste')).toBe(true)
    expect(data.summary.possibleDuplicateCount).toBeGreaterThan(0)
  })

  it('getCentralCosts returns the full unfiltered item list across all years', async () => {
    await billRepository.save(bill({ year: 2025, totalAmount: 100 }))
    await billRepository.save(bill({ year: 2026, totalAmount: 200 }))
    const items = await getCentralCosts()
    expect(items).toHaveLength(2)
  })

  it('excludes Contract from totalAmount/sourceBreakdown/category aggregation even when one is saved alongside Bill/WasteCost/CostEntry, and reports the real sourceBreakdown counts (Finding #3 + #5 Test A)', async () => {
    const savedBill = await billRepository.save(bill({ year: 2026, totalAmount: 1000 }))
    await billItemRepository.save(billItem(savedBill.id, { categoryId: 'heating', amount: 1000 }))
    await wasteCostRepository.save(wasteCost({ year: 2026, amount: 240 }))
    await costEntryRepository.save(costEntry({ amount: 100, date: '2026-05-01T00:00:00.000Z', categoryId: 'water' }))
    // A Contract with a deliberately large, easy-to-spot monthlyCost - it
    // must never appear as an actual cost anywhere in the result.
    await contractRepository.save(contract({ monthlyCost: 999 }))

    const data = await getCentralCostData(2026)

    expect(data.summary.billAmount).toBe(1000)
    expect(data.summary.wasteAmount).toBe(240)
    expect(data.summary.manualAmount).toBe(100)
    expect(data.summary.totalAmount).toBe(1340)

    expect(data.sourceBreakdown).toEqual([
      { source: 'bill', amount: 1000, count: 1 },
      { source: 'waste', amount: 240, count: 1 },
      { source: 'manual', amount: 100, count: 1 },
    ])

    // 999 (the Contract's monthlyCost) never appears anywhere in the
    // aggregated amounts, category breakdown, or item list.
    const allAmounts = [
      data.summary.totalAmount,
      data.summary.billAmount,
      data.summary.wasteAmount,
      data.summary.manualAmount,
      ...data.categories.map((category) => category.amount),
      ...data.items.map((item) => item.amount),
    ]
    expect(allAmounts).not.toContain(999)
    expect(data.categories.some((category) => category.amount === 999)).toBe(false)
  })

  it('excludes a CostEntry linked to a real, co-present Bill from the total - it is not counted a second time (Finding #5 Test B)', async () => {
    const savedBill = await billRepository.save(bill({ id: 'bill-1', year: 2026, totalAmount: 1000 }))
    await costEntryRepository.save(
      costEntry({ amount: 1000, date: '2026-05-01T00:00:00.000Z', billId: savedBill.id }),
    )

    const data = await getCentralCostData(2026)

    expect(data.summary.totalAmount).toBe(1000)
    expect(data.summary.billAmount).toBe(1000)
    expect(data.summary.manualAmount).toBe(0)

    const billItems = data.items.filter((item) => item.source === 'bill')
    const manualItems = data.items.filter((item) => item.source === 'manual')
    expect(billItems).toHaveLength(1)
    expect(manualItems).toHaveLength(0)
  })
})

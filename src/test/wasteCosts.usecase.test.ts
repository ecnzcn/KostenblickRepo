import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  createWasteCost,
  deleteWasteCost,
  getWasteCost,
  getWasteCostSummary,
  getWasteCostYears,
  listWasteCosts,
  listWasteCostsByYear,
  updateWasteCost,
  validateWasteCostInput,
  type WasteCostInput,
} from '../domain/usecases/wasteCosts'
import type { WasteCost } from '../domain/models/entities'

beforeEach(async () => {
  await deleteDatabase()
})

const baseInput = (overrides: Partial<WasteCostInput> = {}): WasteCostInput => ({
  year: 2026,
  category: 'residual',
  amount: 92,
  ...overrides,
})

describe('validateWasteCostInput', () => {
  it('accepts valid input', () => {
    expect(validateWasteCostInput(baseInput())).toEqual([])
  })

  it('rejects an amount of exactly 0', () => {
    expect(validateWasteCostInput(baseInput({ amount: 0 }))).toContain('Betrag muss größer als 0 sein.')
  })

  it('rejects a negative amount', () => {
    expect(validateWasteCostInput(baseInput({ amount: -1 }))).toContain('Betrag muss größer als 0 sein.')
  })

  it('rejects a non-finite amount', () => {
    expect(validateWasteCostInput(baseInput({ amount: Number.NaN }))).toContain('Betrag muss größer als 0 sein.')
  })

  it('accepts a positive amount', () => {
    expect(validateWasteCostInput(baseInput({ amount: 92 }))).toEqual([])
  })

  it('rejects a missing category', () => {
    expect(validateWasteCostInput(baseInput({ category: '' as never }))).toContain('Kategorie ist erforderlich.')
  })

  it('rejects a missing/invalid year', () => {
    expect(validateWasteCostInput(baseInput({ year: Number.NaN }))).toContain('Jahr ist ungültig.')
    expect(validateWasteCostInput(baseInput({ year: 1999 }))).toContain('Jahr ist ungültig.')
  })
})

describe('createWasteCost', () => {
  it('persists a valid entry', async () => {
    const created = await createWasteCost(baseInput())
    expect(created.year).toBe(2026)
    expect(created.category).toBe('residual')
    expect(created.amount).toBe(92)

    const reloaded = await getWasteCost(created.id)
    expect(reloaded?.id).toBe(created.id)
  })

  it('rejects invalid input without writing anything', async () => {
    await expect(createWasteCost(baseInput({ amount: -5 }))).rejects.toThrow()
    expect(await listWasteCosts()).toHaveLength(0)
  })

  it('stores amounts as plain numbers, not formatted strings', async () => {
    const created = await createWasteCost(baseInput({ amount: 186.4 }))
    expect(created.amount).toBe(186.4)
    expect(typeof created.amount).toBe('number')
  })
})

describe('updateWasteCost', () => {
  it('updates fields', async () => {
    const created = await createWasteCost(baseInput())
    const updated = await updateWasteCost(created.id, baseInput({ amount: 120, category: 'organic' }))

    expect(updated.id).toBe(created.id)
    expect(updated.amount).toBe(120)
    expect(updated.category).toBe('organic')
  })

  it('throws when the entry does not exist', async () => {
    await expect(updateWasteCost('missing', baseInput())).rejects.toThrow('nicht gefunden')
  })

  it('rejects invalid input without changing the existing entry', async () => {
    const created = await createWasteCost(baseInput())
    await expect(updateWasteCost(created.id, baseInput({ category: '' as never }))).rejects.toThrow()
    const reloaded = await getWasteCost(created.id)
    expect(reloaded?.category).toBe('residual')
  })
})

describe('deleteWasteCost', () => {
  it('soft-deletes the entry', async () => {
    const created = await createWasteCost(baseInput())
    await deleteWasteCost(created.id)
    expect(await listWasteCosts()).toHaveLength(0)
  })

  it('is safe to call for an unknown id', async () => {
    await expect(deleteWasteCost('missing')).resolves.toBeUndefined()
  })
})

describe('listWasteCostsByYear', () => {
  const entries: WasteCost[] = [
    { id: '1', year: 2026, category: 'residual', amount: 10 } as WasteCost,
    { id: '2', year: 2025, category: 'organic', amount: 20 } as WasteCost,
    { id: '3', year: 2026, category: 'paper', amount: 5 } as WasteCost,
  ]

  it('filters entries to the given year', () => {
    expect(listWasteCostsByYear(entries, 2026).map((e) => e.id)).toEqual(['1', '3'])
  })

  it('returns an empty array for a year with no entries', () => {
    expect(listWasteCostsByYear(entries, 2020)).toEqual([])
  })
})

describe('getWasteCostYears', () => {
  it('returns every year with data, newest first, deduplicated', () => {
    const entries: WasteCost[] = [
      { id: '1', year: 2024, category: 'residual', amount: 10 } as WasteCost,
      { id: '2', year: 2026, category: 'organic', amount: 20 } as WasteCost,
      { id: '3', year: 2024, category: 'paper', amount: 5 } as WasteCost,
    ]
    expect(getWasteCostYears(entries)).toEqual([2026, 2024])
  })

  it('returns an empty array for no data', () => {
    expect(getWasteCostYears([])).toEqual([])
  })
})

describe('getWasteCostSummary', () => {
  const entries: WasteCost[] = [
    { id: '1', year: 2026, category: 'residual', amount: 92 } as WasteCost,
    { id: '2', year: 2026, category: 'organic', amount: 38.4 } as WasteCost,
    { id: '3', year: 2026, category: 'paper', amount: 24 } as WasteCost,
    { id: '4', year: 2026, category: 'bulky', amount: 32 } as WasteCost,
    { id: '5', year: 2025, category: 'residual', amount: 174.2 } as WasteCost,
  ]

  it('sums the total and breaks it down per category, sorted by amount descending', () => {
    const summary = getWasteCostSummary(entries, 2026)
    expect(summary.total).toBe(186.4)
    expect(summary.byCategory).toEqual([
      { category: 'residual', amount: 92 },
      { category: 'bulky', amount: 32 },
      { category: 'organic', amount: 38.4 },
      { category: 'paper', amount: 24 },
    ].sort((a, b) => b.amount - a.amount))
  })

  it('computes the year-over-year change against the previous year', () => {
    const summary = getWasteCostSummary(entries, 2026)
    expect(summary.previousYearTotal).toBe(174.2)
    expect(summary.change).toBeCloseTo(12.2, 2)
    expect(summary.changePercent).toBeCloseTo(7.0034, 2)
  })

  it('reports no comparison when there is no previous-year data', () => {
    const summary = getWasteCostSummary(entries, 2025)
    expect(summary.previousYearTotal).toBeUndefined()
    expect(summary.change).toBeUndefined()
    expect(summary.changePercent).toBeUndefined()
  })

  it('reports null percent (no valid base) when the previous year total was exactly 0', () => {
    const withZeroPreviousYear: WasteCost[] = [
      ...entries,
      { id: '6', year: 2024, category: 'residual', amount: 0 } as WasteCost,
    ]
    const summary = getWasteCostSummary(withZeroPreviousYear, 2025)
    expect(summary.previousYearTotal).toBe(0)
    expect(summary.changePercent).toBeNull()
  })

  it('returns a zero summary for a year with no data', () => {
    const summary = getWasteCostSummary(entries, 2020)
    expect(summary.total).toBe(0)
    expect(summary.byCategory).toEqual([])
  })

  it('handles multiple entries in the same category by summing them', () => {
    const sameCategoryEntries: WasteCost[] = [
      { id: '1', year: 2026, category: 'residual', amount: 50 } as WasteCost,
      { id: '2', year: 2026, category: 'residual', amount: 42 } as WasteCost,
    ]
    const summary = getWasteCostSummary(sameCategoryEntries, 2026)
    expect(summary.total).toBe(92)
    expect(summary.byCategory).toEqual([{ category: 'residual', amount: 92 }])
  })
})

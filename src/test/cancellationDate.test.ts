import { describe, expect, it } from 'vitest'
import { calculateCancellationDate } from '../domain/usecases/cancellationDate'

describe('calculateCancellationDate', () => {
  it('subtracts days', () => {
    expect(calculateCancellationDate('2026-12-31T00:00:00.000Z', 14, 'days')).toBe(
      '2026-12-17T00:00:00.000Z',
    )
  })

  it('subtracts weeks', () => {
    expect(calculateCancellationDate('2026-12-31T00:00:00.000Z', 4, 'weeks')).toBe(
      '2026-12-03T00:00:00.000Z',
    )
  })

  it('subtracts months, including a year rollback', () => {
    expect(calculateCancellationDate('2027-01-31T00:00:00.000Z', 3, 'months')).toBe(
      '2026-10-31T00:00:00.000Z',
    )
  })

  it('subtracts years', () => {
    expect(calculateCancellationDate('2026-12-31T00:00:00.000Z', 1, 'years')).toBe(
      '2025-12-31T00:00:00.000Z',
    )
  })

  it('clamps to the last day of the target month instead of overflowing', () => {
    // 31.12.2026 - 3 Monate must land on 30.09.2026 (September has 30 days),
    // not roll over to 01.10.2026 the way naive Date.setUTCMonth arithmetic would.
    expect(calculateCancellationDate('2026-12-31T00:00:00.000Z', 3, 'months')).toBe(
      '2026-09-30T00:00:00.000Z',
    )
  })

  it('clamps a leap-day end date when subtracting years', () => {
    expect(calculateCancellationDate('2028-02-29T00:00:00.000Z', 1, 'years')).toBe(
      '2027-02-28T00:00:00.000Z',
    )
  })

  it('lands on the last day of the target month when the end date is itself month-end (30.11. -> 31.10.)', () => {
    expect(calculateCancellationDate('2026-11-30T00:00:00.000Z', 1, 'months')).toBe(
      '2026-10-31T00:00:00.000Z',
    )
  })

  it('lands on the last day of the target month when the end date is itself month-end (31.12. -> 30.11.)', () => {
    expect(calculateCancellationDate('2026-12-31T00:00:00.000Z', 1, 'months')).toBe(
      '2026-11-30T00:00:00.000Z',
    )
  })

  it('lands on the last day of February for a month-end end date (31.03. -> 28.02., non-leap year)', () => {
    expect(calculateCancellationDate('2027-03-31T00:00:00.000Z', 1, 'months')).toBe(
      '2027-02-28T00:00:00.000Z',
    )
  })

  it('lands on the last day of February for a month-end end date in a leap year (31.03. -> 29.02.)', () => {
    expect(calculateCancellationDate('2028-03-31T00:00:00.000Z', 1, 'months')).toBe(
      '2028-02-29T00:00:00.000Z',
    )
  })

  it('keeps the same day-of-month for a date that is not month-end', () => {
    expect(calculateCancellationDate('2026-11-15T00:00:00.000Z', 1, 'months')).toBe(
      '2026-10-15T00:00:00.000Z',
    )
    expect(calculateCancellationDate('2026-11-20T00:00:00.000Z', 1, 'months')).toBe(
      '2026-10-20T00:00:00.000Z',
    )
  })
})

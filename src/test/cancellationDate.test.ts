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
})

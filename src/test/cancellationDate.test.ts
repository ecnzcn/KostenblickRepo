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
})

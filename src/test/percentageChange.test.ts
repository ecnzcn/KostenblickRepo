import { describe, expect, it } from 'vitest'
import { calculatePercentageChange } from '../domain/usecases/percentageChange'

describe('calculatePercentageChange', () => {
  it('computes a positive change', () => {
    expect(calculatePercentageChange(100, 104.2)).toBeCloseTo(4.2)
  })

  it('computes a negative change', () => {
    expect(calculatePercentageChange(200, 150)).toBe(-25)
  })

  it('returns null when oldValue is 0 instead of dividing by zero', () => {
    expect(calculatePercentageChange(0, 50)).toBeNull()
    expect(calculatePercentageChange(0, 0)).toBeNull()
  })
})

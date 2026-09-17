import { describe, expect, it } from 'vitest'
import { parseGermanAmount, roundToCents } from '../utils/money'

describe('parseGermanAmount', () => {
  it('parses a simple German decimal', () => {
    expect(parseGermanAmount('125,50')).toBe(125.5)
  })

  it('parses a value with a thousands separator', () => {
    expect(parseGermanAmount('1.234,56')).toBe(1234.56)
  })

  it('parses a plain integer', () => {
    expect(parseGermanAmount('42')).toBe(42)
  })

  it('parses a value typed with a dot as decimal separator', () => {
    expect(parseGermanAmount('125.5')).toBe(125.5)
  })

  it('strips a trailing currency sign and whitespace', () => {
    expect(parseGermanAmount(' 49,99 € ')).toBe(49.99)
  })

  it('returns null for empty input', () => {
    expect(parseGermanAmount('')).toBeNull()
    expect(parseGermanAmount('   ')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseGermanAmount('abc')).toBeNull()
  })
})

describe('roundToCents', () => {
  it('avoids floating point drift from repeated addition', () => {
    const sum = [0.1, 0.2].reduce((acc, n) => acc + n, 0)
    expect(roundToCents(sum)).toBe(0.3)
  })
})

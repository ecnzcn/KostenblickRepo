/**
 * Parses a German-style decimal amount ("125,50", "1.234,56", or plain
 * "125.5") into a number rounded to cents. Returns null when the input
 * cannot be parsed as a finite number.
 */
export function parseGermanAmount(input: string): number | null {
  const trimmed = input.trim().replace(/€/g, '').trim()
  if (!trimmed) return null

  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return roundToCents(value)
}

export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

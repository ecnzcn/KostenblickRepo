/**
 * ((newValue - oldValue) / oldValue) * 100, with a safe fallback when
 * oldValue is 0 (percentage change is undefined, not Infinity/NaN).
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number | null {
  if (oldValue === 0) return null
  return ((newValue - oldValue) / oldValue) * 100
}

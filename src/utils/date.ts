const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Whole days from referenceDate's UTC midnight until the given ISO date. */
export function daysUntil(iso: string, referenceDate: Date = new Date()): number {
  const startOfToday = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  )
  const target = new Date(iso).getTime()
  return Math.ceil((target - startOfToday) / MS_PER_DAY)
}

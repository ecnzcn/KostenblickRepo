/** Calendar months as 'YYYY-MM' keys - plain string math, no time zones. */
export type MonthKey = string

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

function parts(month: MonthKey): [number, number] {
  const [year, monthNumber] = month.split('-').map(Number)
  return [year ?? 0, monthNumber ?? 1]
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, monthNumber] = parts(month)
  const index = year * 12 + (monthNumber - 1) + count
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Months from a to b (b - a); negative when b is earlier. */
export function monthDistance(a: MonthKey, b: MonthKey): number {
  const [yearA, monthA] = parts(a)
  const [yearB, monthB] = parts(b)
  return (yearB - yearA) * 12 + (monthB - monthA)
}

export function firstDayOf(month: MonthKey): string {
  return `${month}-01`
}

export function lastDayOf(month: MonthKey): string {
  const [year, monthNumber] = parts(month)
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

/** Inclusive list from `from` to `to`, oldest first. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = []
  for (let month = from; monthDistance(month, to) >= 0; month = addMonths(month, 1)) months.push(month)
  return months
}

export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

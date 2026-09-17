const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const monthYearFormatter = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
})

const monthShortFormatter = new Intl.DateTimeFormat('de-DE', { month: 'short' })

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date)
}

/** '2026-09' -> 'Sep' */
export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return monthShortFormatter.format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)))
}

export function formatPercentChange(percent: number): string {
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`
}

/** Like formatPercentChange, but for a comparison that may have no valid
 * base (e.g. the previous year was 0 or doesn't exist) - shows "—"
 * instead of a misleading or NaN/Infinity percentage. */
export function formatPercentChangeOrDash(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return '—'
  return formatPercentChange(percent)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

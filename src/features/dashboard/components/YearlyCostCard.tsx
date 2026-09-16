import { formatCurrency, formatPercentChange } from '../../../utils/formatters'

interface YearlyCostCardProps {
  amount: number
  changePercent: number | null
  referenceDate: Date
}

const januaryFormatter = new Intl.DateTimeFormat('de-DE', { month: 'long' })

function formatYearRange(date: Date): string {
  const year = date.getFullYear()
  const january = januaryFormatter.format(new Date(year, 0, 1))
  if (date.getMonth() === 0) return `${january} ${year}`
  const currentMonth = januaryFormatter.format(date)
  return `${january} – ${currentMonth} ${year}`
}

export function YearlyCostCard({ amount, changePercent, referenceDate }: YearlyCostCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">Jahreskosten</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">{formatCurrency(amount)}</p>
      <p className="mt-1 text-sm text-neutral-500">{formatYearRange(referenceDate)}</p>
      {changePercent !== null ? (
        <p
          className={`mt-2 text-sm font-medium ${changePercent > 0 ? 'text-orange-600' : 'text-emerald-600'}`}
        >
          {formatPercentChange(changePercent)} gegenüber {referenceDate.getFullYear() - 1}
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-400">Noch kein Vorjahresvergleich</p>
      )}
    </div>
  )
}

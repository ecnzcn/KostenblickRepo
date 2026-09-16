import { formatCurrency, formatMonthYear, formatPercentChange } from '../../../utils/formatters'

interface MonthlyCostCardProps {
  amount: number
  changePercent: number | null
  referenceDate: Date
}

export function MonthlyCostCard({ amount, changePercent, referenceDate }: MonthlyCostCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">Monatskosten</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">{formatCurrency(amount)}</p>
      <p className="mt-1 text-sm text-neutral-500">{formatMonthYear(referenceDate)}</p>
      {changePercent !== null && (
        <p
          className={`mt-2 text-sm font-medium ${changePercent > 0 ? 'text-orange-600' : 'text-emerald-600'}`}
        >
          {formatPercentChange(changePercent)} zum Vormonat
        </p>
      )}
    </div>
  )
}

import { formatCurrency } from '../../../utils/formatters'
import type { CentralCostSummary } from '../costOverview.types'

interface CostOverviewSummaryCardProps {
  summary: CentralCostSummary
}

const SOURCE_ROWS = [
  { key: 'billAmount', label: 'Abrechnungen' },
  { key: 'wasteAmount', label: 'Müll' },
  { key: 'manualAmount', label: 'Manuell' },
] as const

export function CostOverviewSummaryCard({ summary }: CostOverviewSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">Gesamtkosten {summary.year}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900">
        {formatCurrency(summary.totalAmount)}
      </p>
      <p className="mt-1 text-xs text-neutral-400">Abrechnungen + Müll + manuelle Kosten</p>

      <ul className="mt-4 flex flex-col divide-y divide-neutral-100 border-t border-neutral-100">
        {SOURCE_ROWS.map((row) => (
          <li key={row.key} className="flex items-center justify-between py-2 text-sm">
            <span className="text-neutral-500">{row.label}</span>
            <span className="font-medium text-neutral-900">{formatCurrency(summary[row.key])}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-neutral-400">
        Vertragskosten (laufende Verpflichtungen) sind hier bewusst nicht enthalten - sie sind keine tatsächlich
        angefallenen Kosten.
      </p>
    </div>
  )
}

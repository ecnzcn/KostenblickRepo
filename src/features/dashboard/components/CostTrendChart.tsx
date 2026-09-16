import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'
import { formatCurrency, formatMonthShort } from '../../../utils/formatters'
import type { MonthlyCost } from '../dashboard.types'

interface CostTrendChartProps {
  monthlyCosts: MonthlyCost[]
}

const BAR_WIDTH = 28
const GAP = 14
const CHART_HEIGHT = 120
const LABEL_HEIGHT = 24

export function CostTrendChart({ monthlyCosts }: CostTrendChartProps) {
  const hasData = monthlyCosts.some((entry) => entry.amount > 0)

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Kostenentwicklung</h2>
      {!hasData ? (
        <div className="mt-4 flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-neutral-500">
            Noch keine Kostendaten vorhanden.
            <br />
            Importiere deine erste Abrechnung, um deine Kostenentwicklung zu sehen.
          </p>
          <Link
            to={ROUTES.billsNew}
            className="mt-1 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
          >
            Abrechnung importieren
          </Link>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${monthlyCosts.length * (BAR_WIDTH + GAP)} ${CHART_HEIGHT + LABEL_HEIGHT}`}
          className="mt-4 w-full"
          role="img"
          aria-label="Monatliche Kosten des laufenden Jahres"
        >
          {monthlyCosts.map((entry, index) => {
            const max = Math.max(...monthlyCosts.map((m) => m.amount), 1)
            const barHeight = entry.amount > 0 ? Math.max((entry.amount / max) * CHART_HEIGHT, 4) : 0
            const x = index * (BAR_WIDTH + GAP)
            const y = CHART_HEIGHT - barHeight

            return (
              <g key={entry.month}>
                <title>{`${formatMonthShort(entry.month)}: ${formatCurrency(entry.amount)}`}</title>
                <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={4} className="fill-accent" />
                <text
                  x={x + BAR_WIDTH / 2}
                  y={CHART_HEIGHT + 16}
                  textAnchor="middle"
                  className="fill-neutral-400 text-[10px]"
                >
                  {formatMonthShort(entry.month)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </section>
  )
}

import { formatCurrency, formatMonthShort } from '../../../utils/formatters'
import type { MonthlyStatistic } from '../statistics.types'

interface MonthlyCostChartProps {
  monthlyStatistics: MonthlyStatistic[]
  hasMonthlyData: boolean
}

const BAR_WIDTH = 28
const GAP = 10
const CHART_HEIGHT = 120
const LABEL_HEIGHT = 24

export function MonthlyCostChart({ monthlyStatistics, hasMonthlyData }: MonthlyCostChartProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Kostenentwicklung</h2>
      {!hasMonthlyData ? (
        <p className="mt-4 text-sm text-neutral-500">
          Für dieses Jahr liegen noch nicht genügend monatlich zuordenbare Daten vor.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${monthlyStatistics.length * (BAR_WIDTH + GAP)} ${CHART_HEIGHT + LABEL_HEIGHT}`}
            className="mt-4 w-full"
            role="img"
            aria-label="Monatliche Kosten des gewählten Jahres, soweit einem Monat zuordenbar"
          >
            {monthlyStatistics.map((entry, index) => {
              const max = Math.max(...monthlyStatistics.map((m) => m.amount), 1)
              const barHeight = entry.hasActualData ? Math.max((entry.amount / max) * CHART_HEIGHT, 4) : 0
              const x = index * (BAR_WIDTH + GAP)
              const y = CHART_HEIGHT - barHeight

              return (
                <g key={entry.month}>
                  <title>
                    {entry.hasActualData
                      ? `${formatMonthShort(entry.month)}: ${formatCurrency(entry.amount)}`
                      : `${formatMonthShort(entry.month)}: keine zuordenbaren Daten`}
                  </title>
                  {entry.hasActualData ? (
                    <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={4} className="fill-accent" />
                  ) : (
                    <rect
                      x={x}
                      y={CHART_HEIGHT - 2}
                      width={BAR_WIDTH}
                      height={2}
                      rx={1}
                      className="fill-neutral-200"
                    />
                  )}
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
          <ul className="sr-only">
            {monthlyStatistics
              .filter((entry) => entry.hasActualData)
              .map((entry) => (
                <li key={entry.month}>
                  {formatMonthShort(entry.month)}: {formatCurrency(entry.amount)}
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  )
}

import { formatCurrency } from '../../../utils/formatters'
import type { YearStatistic } from '../statistics.types'

interface YearComparisonChartProps {
  yearStatistics: YearStatistic[]
}

const BAR_WIDTH = 48
const GAP = 24
const CHART_HEIGHT = 140
const LABEL_HEIGHT = 24

export function YearComparisonChart({ yearStatistics }: YearComparisonChartProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Mehrjahresvergleich</h2>
      {yearStatistics.length < 2 ? (
        <p className="mt-4 text-sm text-neutral-500">
          Sobald Abrechnungen für mehrere Jahre vorliegen, siehst du hier den Vergleich.
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${yearStatistics.length * (BAR_WIDTH + GAP)} ${CHART_HEIGHT + LABEL_HEIGHT}`}
            className="mt-4 w-full"
            role="img"
            aria-label="Jahreskosten im Mehrjahresvergleich"
          >
            {yearStatistics.map((entry, index) => {
              const max = Math.max(...yearStatistics.map((y) => y.amount), 1)
              const barHeight = entry.amount > 0 ? Math.max((entry.amount / max) * CHART_HEIGHT, 4) : 0
              const x = index * (BAR_WIDTH + GAP)
              const y = CHART_HEIGHT - barHeight

              return (
                <g key={entry.year}>
                  <title>{`${entry.year}: ${formatCurrency(entry.amount)}`}</title>
                  <rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={6} className="fill-accent" />
                  <text
                    x={x + BAR_WIDTH / 2}
                    y={CHART_HEIGHT + 18}
                    textAnchor="middle"
                    className="fill-neutral-500 text-xs"
                  >
                    {entry.year}
                  </text>
                </g>
              )
            })}
          </svg>
          <ul className="sr-only">
            {yearStatistics.map((entry) => (
              <li key={entry.year}>
                {entry.year}: {formatCurrency(entry.amount)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

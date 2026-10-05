import { useState, type PointerEvent } from 'react'
import { EXPENSE_SERIES_COLOR, INCOME_SERIES_COLOR } from '../../../constants/categoryGroups'
import type { DailyPoint } from '../../../domain/usecases/finance/monthlyOverview'
import { formatCurrency } from '../../../utils/formatters'

const WIDTH = 360
const HEIGHT = 190
const PAD = { top: 10, right: 8, bottom: 22, left: 50 }

/** Round an axis maximum up to a readable step (1, 1.5, 2 … 8 × 10^n). */
function niceMax(value: number): number {
  if (value <= 0) return 100
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

function dayLabel(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`
}

const axisFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })

/**
 * Running totals of income and expenses through the month - real daily
 * values drawn as steps (a total only changes on a booking day), no
 * smoothing or interpolation. Tap or hover shows the values of a day.
 */
export function MonthFlowChart({ points }: { points: DailyPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  if (points.length === 0) return null

  const max = niceMax(Math.max(...points.map((point) => Math.max(point.cumulativeIncome, point.cumulativeExpenses))))
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const step = plotWidth / points.length
  const x = (index: number) => PAD.left + index * step
  const y = (value: number) => PAD.top + plotHeight - (Math.max(0, value) / max) * plotHeight

  function stepPath(values: number[]): string {
    let path = `M ${x(0)} ${y(0)}`
    values.forEach((value, index) => {
      path += ` V ${y(value)} H ${x(index + 1)}`
    })
    return path
  }

  const incomePath = stepPath(points.map((point) => point.cumulativeIncome))
  const expensePath = stepPath(points.map((point) => point.cumulativeExpenses))
  const baseline = y(0)
  const ticks = [0, max / 2, max]
  const labelDays = [0, 9, 19, points.length - 1].filter((index, position, all) => index < points.length && all.indexOf(index) === position)
  const activePoint = active !== null ? points[active] : undefined
  const bookingDays = points.filter((point) => point.income !== 0 || point.expenses !== 0)

  function handlePointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.floor((svgX - PAD.left) / step)
    setActive(Math.min(points.length - 1, Math.max(0, index)))
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ backgroundColor: INCOME_SERIES_COLOR }} />
          Einnahmen
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded" style={{ backgroundColor: EXPENSE_SERIES_COLOR }} />
          Ausgaben
        </span>
      </div>
      <p className="min-h-5 text-xs text-neutral-700" aria-live="polite">
        {activePoint
          ? `Bis ${dayLabel(activePoint.date)}: Einnahmen ${formatCurrency(activePoint.cumulativeIncome)}, Ausgaben ${formatCurrency(activePoint.cumulativeExpenses)}`
          : 'Tippe auf das Diagramm für die Werte eines Tages.'}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label="Einnahmen und Ausgaben im Monatsverlauf, aufsummiert"
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">
              {axisFormatter.format(tick)} €
            </text>
          </g>
        ))}
        <path d={`${incomePath} V ${baseline} H ${x(0)} Z`} fill={INCOME_SERIES_COLOR} fillOpacity={0.08} />
        <path d={`${expensePath} V ${baseline} H ${x(0)} Z`} fill={EXPENSE_SERIES_COLOR} fillOpacity={0.08} />
        <path d={incomePath} fill="none" stroke={INCOME_SERIES_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={expensePath} fill="none" stroke={EXPENSE_SERIES_COLOR} strokeWidth={1.5} strokeLinejoin="round" />
        {labelDays.map((index) => (
          <text
            key={index}
            x={index === points.length - 1 ? WIDTH - PAD.right : x(index) + step / 2}
            y={HEIGHT - 6}
            textAnchor={index === points.length - 1 ? 'end' : 'middle'}
            className="fill-neutral-500 text-[11px]"
          >
            {dayLabel(points[index]?.date ?? '')}
          </text>
        ))}
        {activePoint && active !== null ? (
          <g>
            <line x1={x(active) + step / 2} x2={x(active) + step / 2} y1={PAD.top} y2={baseline} stroke="#a3a3a3" strokeWidth={1} />
            {[
              { value: activePoint.cumulativeIncome, color: INCOME_SERIES_COLOR },
              { value: activePoint.cumulativeExpenses, color: EXPENSE_SERIES_COLOR },
            ].map((marker) => (
              <circle key={marker.color} cx={x(active) + step / 2} cy={y(marker.value)} r={4} fill={marker.color} stroke="#ffffff" strokeWidth={1.5} />
            ))}
          </g>
        ) : null}
      </svg>
      <table className="sr-only">
        <caption>Buchungstage im Monat</caption>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Einnahmen</th>
            <th scope="col">Ausgaben</th>
          </tr>
        </thead>
        <tbody>
          {bookingDays.map((point) => (
            <tr key={point.date}>
              <th scope="row">{dayLabel(point.date)}</th>
              <td>{formatCurrency(point.income)}</td>
              <td>{formatCurrency(point.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

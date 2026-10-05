import { categoryGroupColor } from '../../../constants/categoryGroups'
import type { CategoryGroupShare } from '../../../domain/usecases/finance/monthlyOverview'
import { formatCurrency } from '../../../utils/formatters'

const RADIUS = 52
const STROKE = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** 2px surface gap between slices, in circumference units. */
const GAP = 2

function percent(share: number): string {
  return `${Math.round(share * 100)} %`
}

function Donut({ groups, total }: { groups: CategoryGroupShare[]; total: number }) {
  const offsets = groups.map((_, index) => groups.slice(0, index).reduce((sum, group) => sum + group.share * CIRCUMFERENCE, 0))
  return (
    <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0" aria-hidden="true">
      <g transform="rotate(-90 70 70)">
        {groups.map((group, index) => {
          const visible = Math.max(0, group.share * CIRCUMFERENCE - (groups.length > 1 ? GAP : 0))
          return (
            <circle
              key={group.groupId}
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              stroke={categoryGroupColor(group.groupId)}
              strokeWidth={STROKE}
              strokeDasharray={`${visible} ${CIRCUMFERENCE - visible}`}
              strokeDashoffset={-(offsets[index] ?? 0)}
            />
          )
        })}
      </g>
      <text x={70} y={68} textAnchor="middle" className="fill-neutral-900 text-[12px] font-semibold">
        {formatCurrency(total)}
      </text>
      <text x={70} y={86} textAnchor="middle" className="fill-neutral-500 text-[11px]">
        insgesamt
      </text>
    </svg>
  )
}

/** Expenses by category group: donut plus a labeled bar list - every
 * group is named with amount and share, so color is never the only key. */
export function ExpenseGroups({ groups, total }: { groups: CategoryGroupShare[]; total: number }) {
  if (groups.length === 0) {
    return <p className="text-sm text-neutral-500">In diesem Monat gibt es keine Ausgaben.</p>
  }
  const largest = Math.max(...groups.map((group) => group.share))
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <Donut groups={groups} total={total} />
      <ul className="flex w-full min-w-0 flex-col gap-3" aria-label="Ausgaben nach Kategorie">
        {groups.map((group) => (
          <li key={group.groupId} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-neutral-900">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryGroupColor(group.groupId) }} />
                <span className="truncate">{group.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-neutral-900">
                {formatCurrency(group.amount)} <span className="text-neutral-500">· {percent(group.share)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-neutral-100" aria-hidden="true">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${largest > 0 ? (group.share / largest) * 100 : 0}%`, backgroundColor: categoryGroupColor(group.groupId) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

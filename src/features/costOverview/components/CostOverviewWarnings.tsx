import type { CostAggregationWarning } from '../costOverview.types'

interface CostOverviewWarningsProps {
  warnings: CostAggregationWarning[]
}

/** Surfaces a possible overlap between sources transparently instead of
 * silently merging or removing anything - see CLAUDE.md, "Doppelzählung".
 * Renders nothing when there is nothing to flag. */
export function CostOverviewWarnings({ warnings }: CostOverviewWarningsProps) {
  if (warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-2" role="alert">
      {warnings.map((warning, index) => (
        <div
          key={`${warning.type}-${warning.year}-${index}`}
          className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <p className="font-medium">⚠ Mögliche Doppelzählung</p>
          <p className="mt-1">{warning.description}</p>
        </div>
      ))}
    </div>
  )
}

import { formatCurrency } from '../../../utils/formatters'
import type { CentralCostCategoryBreakdown } from '../costOverview.types'

interface CostOverviewCategoryChartProps {
  categories: CentralCostCategoryBreakdown[]
}

export function CostOverviewCategoryChart({ categories }: CostOverviewCategoryChartProps) {
  const max = Math.max(...categories.map((category) => category.amount), 1)

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Kosten nach Kategorie</h2>
      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine kategorisierbaren Kosten für dieses Jahr vorhanden.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {categories.map((category) => (
            <li key={category.categoryId ?? 'unassigned'}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-neutral-700">
                  <span aria-hidden="true">{category.categoryIcon}</span>
                  {category.categoryName}
                </span>
                <span className="font-medium text-neutral-900">
                  {formatCurrency(category.amount)}
                  <span className="ml-2 text-neutral-400">
                    ({category.percentage.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %)
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(category.amount / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

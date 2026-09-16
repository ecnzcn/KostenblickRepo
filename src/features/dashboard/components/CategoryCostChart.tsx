import { formatCurrency } from '../../../utils/formatters'
import type { CategoryCost } from '../dashboard.types'

interface CategoryCostChartProps {
  categories: CategoryCost[]
}

export function CategoryCostChart({ categories }: CategoryCostChartProps) {
  const max = Math.max(...categories.map((category) => category.amount), 1)

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Kosten nach Kategorie</h2>
      {categories.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">Noch keine Kosten vorhanden.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {categories.map((category) => (
            <li key={category.categoryId}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-neutral-700">
                  <span aria-hidden="true">{category.categoryIcon}</span>
                  {category.categoryName}
                </span>
                <span className="font-medium text-neutral-900">{formatCurrency(category.amount)}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(category.amount / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

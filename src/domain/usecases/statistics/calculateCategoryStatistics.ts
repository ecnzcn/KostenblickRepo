import type { BillItem, Category } from '../../models/entities'
import { roundToCents } from '../../../utils/money'
import type { CategoryStatistic } from './statisticsTypes'

export const UNASSIGNED_CATEGORY_NAME = 'Nicht zugeordnet'
const UNASSIGNED_CATEGORY_ICON = '•'
const UNASSIGNED_KEY = '__unassigned__'

/**
 * Groups BillItems by category, largest amount first. Items without a
 * categoryId are never dropped - they are grouped under the explicit
 * "Nicht zugeordnet" bucket so a category-less position doesn't just
 * disappear from the breakdown. Percentages are relative to the sum of
 * the given items (the itemized total), not the bill totals - see
 * statisticsTypes.ts for how the separate Bill-vs-Items difference is
 * surfaced instead.
 */
export function calculateCategoryStatistics(billItems: BillItem[], categories: Category[]): CategoryStatistic[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string, number>()

  for (const item of billItems) {
    const key = item.categoryId ?? UNASSIGNED_KEY
    totals.set(key, (totals.get(key) ?? 0) + item.amount)
  }

  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)

  return [...totals.entries()]
    .map(([key, amount]) => {
      const isUnassigned = key === UNASSIGNED_KEY
      const category = isUnassigned ? undefined : categoriesById.get(key)
      return {
        categoryId: isUnassigned ? undefined : key,
        categoryName: isUnassigned ? UNASSIGNED_CATEGORY_NAME : (category?.name ?? key),
        categoryIcon: isUnassigned ? UNASSIGNED_CATEGORY_ICON : (category?.icon ?? '•'),
        amount: roundToCents(amount),
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

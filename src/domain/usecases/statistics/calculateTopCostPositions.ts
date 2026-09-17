import type { BillItem, Category } from '../../models/entities'
import { roundToCents } from '../../../utils/money'
import { UNASSIGNED_CATEGORY_NAME } from './calculateCategoryStatistics'
import type { TopCostPosition } from './statisticsTypes'

export const DEFAULT_TOP_COST_POSITIONS_COUNT = 5

/** The most expensive individual cost positions (BillItems), largest
 * first. `count` is configurable (default Top 5). Percentage is relative
 * to the sum of all given items, matching calculateCategoryStatistics. */
export function calculateTopCostPositions(
  billItems: BillItem[],
  categories: Category[],
  count: number = DEFAULT_TOP_COST_POSITIONS_COUNT,
): TopCostPosition[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const total = billItems.reduce((sum, item) => sum + item.amount, 0)

  return [...billItems]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count)
    .map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryId ? (categoriesById.get(item.categoryId)?.name ?? item.categoryId) : UNASSIGNED_CATEGORY_NAME,
      description: item.description,
      amount: roundToCents(item.amount),
      percentage: total > 0 ? (item.amount / total) * 100 : 0,
    }))
}

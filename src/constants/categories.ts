import type { Category } from '../domain/models/entities'

const now = '2026-01-01T00:00:00.000Z'

type CategorySeed = Pick<Category, 'id' | 'name' | 'icon'> & Partial<Pick<Category, 'type' | 'group'>>

/** Group id the utility-cost categories roll up into in finance views. */
export const HOUSING_CATEGORY_ID = 'housing'
export const CREDIT_CARD_UNITEMIZED_CATEGORY_ID = 'credit_card_unitemized'
export const SAVINGS_CATEGORY_ID = 'savings'
export const SALARY_CATEGORY_ID = 'salary'
export const OTHER_INCOME_CATEGORY_ID = 'other_income'

const CATEGORY_SEED: ReadonlyArray<CategorySeed> = [
  { id: 'heating', name: 'Heizung', icon: '🔥', group: HOUSING_CATEGORY_ID },
  { id: 'water', name: 'Wasser', icon: '💧', group: HOUSING_CATEGORY_ID },
  { id: 'waste', name: 'Müll', icon: '🗑️', group: HOUSING_CATEGORY_ID },
  { id: 'property_tax', name: 'Grundsteuer', icon: '🏠', group: HOUSING_CATEGORY_ID },
  { id: 'cleaning', name: 'Reinigung', icon: '🧹', group: HOUSING_CATEGORY_ID },
  { id: 'caretaker', name: 'Hausmeister', icon: '🔧', group: HOUSING_CATEGORY_ID },
  { id: 'insurance', name: 'Versicherung', icon: '🛡️' },
  { id: 'electricity', name: 'Strom', icon: '⚡', group: HOUSING_CATEGORY_ID },
  { id: 'internet', name: 'Internet', icon: '🌐' },
  { id: 'telecom', name: 'Telekommunikation', icon: '📱' },
  { id: 'other', name: 'Sonstiges', icon: '•••' },
  // Phase 14 (Finanztracker)
  { id: HOUSING_CATEGORY_ID, name: 'Wohnen', icon: '🏡' },
  { id: 'groceries', name: 'Lebensmittel', icon: '🛒' },
  { id: 'mobility', name: 'Mobilität', icon: '🚗' },
  { id: 'leisure', name: 'Freizeit', icon: '🎮' },
  { id: 'subscriptions', name: 'Abos & Verträge', icon: '🔁' },
  { id: 'health', name: 'Gesundheit', icon: '🩺' },
  { id: 'clothing', name: 'Kleidung', icon: '👕' },
  { id: 'shopping', name: 'Einkäufe', icon: '🛍️' },
  { id: 'cash', name: 'Bargeld', icon: '💶' },
  { id: 'fees', name: 'Steuern & Gebühren', icon: '🧾' },
  { id: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, name: 'Kreditkarte (nicht aufgeschlüsselt)', icon: '💳' },
  { id: SAVINGS_CATEGORY_ID, name: 'Sparen', icon: '🐷' },
  { id: SALARY_CATEGORY_ID, name: 'Gehalt', icon: '💼', type: 'income' },
  { id: OTHER_INCOME_CATEGORY_ID, name: 'Sonstige Einnahmen', icon: '➕', type: 'income' },
]

export const DEFAULT_CATEGORIES: Category[] = CATEGORY_SEED.map(({ type, group, ...category }) => ({
  ...category,
  type: type ?? 'both',
  ...(group ? { group } : {}),
  createdAt: now,
  updatedAt: now,
}))

/**
 * Adds every default category missing from `existing` and gives existing
 * defaults their `group` if they lack one. Never renames or otherwise
 * changes a stored category. Used by the v3 migration and after a restore,
 * which would otherwise leave an older backup's category set without the
 * Phase 14 defaults. Returns only the records that need writing.
 */
export function mergeDefaultCategories(existing: readonly Category[]): Category[] {
  const byId = new Map(existing.map((category) => [category.id, category]))
  const writes: Category[] = []
  for (const seed of DEFAULT_CATEGORIES) {
    const stored = byId.get(seed.id)
    if (!stored) writes.push(seed)
    else if (seed.group && !stored.group) writes.push({ ...stored, group: seed.group })
  }
  return writes
}

import type { Category } from '../domain/models/entities'

const now = '2026-01-01T00:00:00.000Z'

const CATEGORY_SEED: ReadonlyArray<Pick<Category, 'id' | 'name' | 'icon'>> = [
  { id: 'heating', name: 'Heizung', icon: '🔥' },
  { id: 'water', name: 'Wasser', icon: '💧' },
  { id: 'waste', name: 'Müll', icon: '🗑️' },
  { id: 'property_tax', name: 'Grundsteuer', icon: '🏠' },
  { id: 'cleaning', name: 'Reinigung', icon: '🧹' },
  { id: 'caretaker', name: 'Hausmeister', icon: '🔧' },
  { id: 'insurance', name: 'Versicherung', icon: '🛡️' },
  { id: 'electricity', name: 'Strom', icon: '⚡' },
  { id: 'internet', name: 'Internet', icon: '🌐' },
  { id: 'telecom', name: 'Telekommunikation', icon: '📱' },
  { id: 'other', name: 'Sonstiges', icon: '•••' },
]

export const DEFAULT_CATEGORIES: Category[] = CATEGORY_SEED.map((category) => ({
  ...category,
  type: 'both',
  createdAt: now,
  updatedAt: now,
}))

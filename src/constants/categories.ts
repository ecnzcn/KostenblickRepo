import type { Category } from '../domain/models/entities'

const now = '2026-01-01T00:00:00.000Z'

export const DEFAULT_CATEGORIES: Category[] = [
  ['heating', 'Heizung', '🔥'],
  ['water', 'Wasser', '💧'],
  ['waste', 'Müll', '🗑️'],
  ['property_tax', 'Grundsteuer', '🏠'],
  ['cleaning', 'Reinigung', '🧹'],
  ['caretaker', 'Hausmeister', '🔧'],
  ['insurance', 'Versicherung', '🛡️'],
  ['electricity', 'Strom', '⚡'],
  ['internet', 'Internet', '🌐'],
  ['telecom', 'Telekommunikation', '📱'],
  ['other', 'Sonstiges', '•••'],
].map(([id, name, icon]) => ({
  id,
  name,
  icon,
  type: 'both' as const,
  createdAt: now,
  updatedAt: now,
}))

import { HOUSING_CATEGORY_ID, OTHER_INCOME_CATEGORY_ID, SAVINGS_CATEGORY_ID } from './categories'

/**
 * Sparkasse's own booking category ("Kategorie" column) → Kostenblick
 * category, used only as a starting suggestion (categorySource 'bank').
 * undefined = deliberately no suggestion, so the booking shows up as
 * uncategorized. Table: docs/specs/phase-14a-entscheidungen.md, 3.3.
 */
export const SPARKASSE_CATEGORY_MAP: Readonly<Record<string, string | undefined>> = {
  'Absicherung und Vorsorge': 'insurance',
  Bargeld: 'cash',
  Bekleidung: 'clothing',
  'Bildung und Erziehung': 'other',
  Einkommen: OTHER_INCOME_CATEGORY_ID,
  Einkäufe: 'shopping',
  'Freizeit und Unterhaltung': 'leisure',
  Geldanlage: SAVINGS_CATEGORY_ID,
  'Gesundheit und Wellness': 'health',
  'Lebensmittel und Drogerie': 'groceries',
  Mobilität: 'mobility',
  'Nicht zugeordnet': undefined,
  Reisen: 'leisure',
  Sonstiges: undefined,
  'Sport und Hobby': 'leisure',
  'Steuern und Gebühren': 'fees',
  Telekommunikation: 'telecom',
  'Wohnen und Garten': HOUSING_CATEGORY_ID,
}

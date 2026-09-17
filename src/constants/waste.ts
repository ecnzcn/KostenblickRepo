import type { WasteCategory } from '../domain/models/entities'

/** Central label map for the fixed set of waste cost categories - the
 * single source of truth so no screen hardcodes its own list. */
export const WASTE_CATEGORY_LABELS: Record<WasteCategory, string> = {
  residual: 'Restmüll',
  organic: 'Biomüll',
  recycling: 'Gelber Sack / Gelbe Tonne',
  paper: 'Papier',
  bulky: 'Sperrmüll',
  other: 'Weitere Müllkosten',
}

export const WASTE_CATEGORY_OPTIONS: { value: WasteCategory; label: string }[] = (
  Object.keys(WASTE_CATEGORY_LABELS) as WasteCategory[]
).map((value) => ({ value, label: WASTE_CATEGORY_LABELS[value] }))

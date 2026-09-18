import { MANUAL_VERIFICATION_CONFIDENCE } from '../../../constants/confidence'
import type { Category } from '../../../domain/models/entities'

export interface BillItemRowState {
  key: string
  categoryId: string
  description: string
  amountText: string
  /** Set only for a row loaded from an existing BillItem (see
   * BillFormPage's edit-mode load effect) - absent for a freshly added row.
   * Used by updateBillWithItems to re-identify the item this row came from;
   * never used for display. */
  id?: string
  confidence?: number
  sourceText?: string
  manuallyVerified?: boolean
}

interface BillItemRowProps {
  item: BillItemRowState
  categories: Category[]
  onChange: (next: BillItemRowState) => void
  onRemove: () => void
  removeDisabled: boolean
}

/** Editing any field of a row loaded from an existing BillItem marks it as
 * manually confirmed - same rule the OCR import review already applies
 * (see features/bills/import/components/ImportItemRow.tsx, markEdited) -
 * applied here so it also holds for a later edit of an already-saved Bill.
 * A brand-new row (no `id` yet) has no OCR provenance to confirm, so it is
 * left untouched; buildItems' existing defaults already cover it. */
function markEdited(item: BillItemRowState, changes: Partial<BillItemRowState>): BillItemRowState {
  if (item.id === undefined) return { ...item, ...changes }
  return { ...item, ...changes, confidence: MANUAL_VERIFICATION_CONFIDENCE, manuallyVerified: true }
}

export function BillItemRow({ item, categories, onChange, onRemove, removeDisabled }: BillItemRowProps) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Kategorie der Kostenposition"
          value={item.categoryId}
          onChange={(event) => onChange(markEdited(item, { categoryId: event.target.value }))}
          className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">Kategorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.icon} {category.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            aria-label="Betrag der Kostenposition"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={item.amountText}
            onChange={(event) => onChange(markEdited(item, { amountText: event.target.value }))}
            className="min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 pr-7 text-sm"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-neutral-400">
            €
          </span>
        </div>
      </div>
      <input
        aria-label="Beschreibung der Kostenposition"
        type="text"
        placeholder="Beschreibung"
        value={item.description}
        onChange={(event) => onChange(markEdited(item, { description: event.target.value }))}
        className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={removeDisabled}
        className="mt-2 min-h-11 text-sm font-medium text-red-600 disabled:text-neutral-300"
      >
        Position entfernen
      </button>
    </div>
  )
}

import type { Category } from '../../../domain/models/entities'

export interface BillItemRowState {
  key: string
  categoryId: string
  description: string
  amountText: string
}

interface BillItemRowProps {
  item: BillItemRowState
  categories: Category[]
  onChange: (next: BillItemRowState) => void
  onRemove: () => void
  removeDisabled: boolean
}

export function BillItemRow({ item, categories, onChange, onRemove, removeDisabled }: BillItemRowProps) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Kategorie der Kostenposition"
          value={item.categoryId}
          onChange={(event) => onChange({ ...item, categoryId: event.target.value })}
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
            onChange={(event) => onChange({ ...item, amountText: event.target.value })}
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
        onChange={(event) => onChange({ ...item, description: event.target.value })}
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

interface ItemActionsProps {
  itemLabel: string
  onEdit: () => void
  onDelete: () => void
}

export function ItemActions({ itemLabel, onEdit, onDelete }: ItemActionsProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${itemLabel} bearbeiten`}
        className="min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
      >
        Bearbeiten
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${itemLabel} löschen`}
        className="min-h-11 flex-1 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600"
      >
        Löschen
      </button>
    </div>
  )
}

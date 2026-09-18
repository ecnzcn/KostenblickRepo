import { DOCUMENT_TYPE_LABELS, OCR_STATUS_LABELS } from '../../../constants/documents'
import type { DocumentOverviewEntry } from '../../../domain/usecases/documents'
import { formatFileSize } from '../../../utils/formatters'

const TYPE_ICON: Record<string, string> = {
  bill: '📄',
  contract: '📄',
  waste: '🗑️',
  other: '📎',
}

interface DocumentListItemProps {
  entry: DocumentOverviewEntry
  onOpen: () => void
}

export function DocumentListItem({ entry, onOpen }: DocumentListItemProps) {
  const { document, linkedEntity } = entry

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white p-4">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
          <span aria-hidden="true">{TYPE_ICON[document.type] ?? '📎'}</span>
          <span className="min-w-0 truncate">{document.filename}</span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          {DOCUMENT_TYPE_LABELS[document.type]} · {formatFileSize(document.size)}
        </p>
        <p className="mt-1 text-xs text-neutral-500">OCR: {OCR_STATUS_LABELS[document.ocrStatus]}</p>
        {linkedEntity ? <p className="mt-1 text-xs font-medium text-accent">{linkedEntity.label}</p> : null}
      </button>
    </li>
  )
}

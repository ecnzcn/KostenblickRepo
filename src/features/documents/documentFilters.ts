import type { DocumentOverviewEntry } from '../../domain/usecases/documents'

export type DocumentTypeFilter = 'all' | 'bill' | 'contract' | 'waste' | 'other'
export type DocumentOcrFilter = 'all' | 'verified' | 'needs_review' | 'failed'
export type DocumentSort = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size'

export interface DocumentFilterOptions {
  search: string
  typeFilter: DocumentTypeFilter
  ocrFilter: DocumentOcrFilter
  sort: DocumentSort
}

export const DEFAULT_DOCUMENT_FILTERS: DocumentFilterOptions = {
  search: '',
  typeFilter: 'all',
  ocrFilter: 'all',
  sort: 'newest',
}

function matchesSearch(entry: DocumentOverviewEntry, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    entry.document.filename.toLowerCase().includes(needle) ||
    (entry.document.ocrText?.toLowerCase().includes(needle) ?? false) ||
    (entry.linkedEntity?.label.toLowerCase().includes(needle) ?? false)
  )
}

const SORTERS: Record<DocumentSort, (a: DocumentOverviewEntry, b: DocumentOverviewEntry) => number> = {
  newest: (a, b) => new Date(b.document.createdAt).getTime() - new Date(a.document.createdAt).getTime(),
  oldest: (a, b) => new Date(a.document.createdAt).getTime() - new Date(b.document.createdAt).getTime(),
  name_asc: (a, b) => a.document.filename.localeCompare(b.document.filename),
  name_desc: (a, b) => b.document.filename.localeCompare(a.document.filename),
  size: (a, b) => b.document.size - a.document.size,
}

/** Pure search/filter/sort over an already-loaded overview list (see
 * listDocumentsOverview) - no IndexedDB access happens here, so typing in
 * the search box or switching a filter chip stays instant. */
export function filterAndSortDocuments(
  entries: DocumentOverviewEntry[],
  options: DocumentFilterOptions,
): DocumentOverviewEntry[] {
  const filtered = entries.filter((entry) => {
    if (options.typeFilter !== 'all' && entry.document.type !== options.typeFilter) return false
    if (options.ocrFilter !== 'all' && entry.document.ocrStatus !== options.ocrFilter) return false
    return matchesSearch(entry, options.search)
  })
  return [...filtered].sort(SORTERS[options.sort])
}

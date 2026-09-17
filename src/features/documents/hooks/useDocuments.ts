import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DocumentOverviewEntry } from '../../../domain/usecases/documents'
import { deleteDocumentAndClearReferences, listDocumentsOverview } from '../../../domain/usecases/documents'
import {
  DEFAULT_DOCUMENT_FILTERS,
  filterAndSortDocuments,
  type DocumentFilterOptions,
} from '../documentFilters'

interface UseDocumentsResult {
  entries: DocumentOverviewEntry[]
  visibleEntries: DocumentOverviewEntry[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
  filters: DocumentFilterOptions
  setFilters: (next: Partial<DocumentFilterOptions>) => void
}

export function useDocuments(): UseDocumentsResult {
  const [entries, setEntries] = useState<DocumentOverviewEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const [filters, setFiltersState] = useState<DocumentFilterOptions>(DEFAULT_DOCUMENT_FILTERS)

  useEffect(() => {
    let cancelled = false
    listDocumentsOverview()
      .then((result) => {
        if (cancelled) return
        setEntries(result)
        setError(undefined)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught : new Error('Unbekannter Fehler'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const refetch = useCallback(() => {
    setLoading(true)
    setError(undefined)
    setReloadToken((token) => token + 1)
  }, [])

  const remove = useCallback(
    async (id: string) => {
      await deleteDocumentAndClearReferences(id)
      refetch()
    },
    [refetch],
  )

  const setFilters = useCallback((next: Partial<DocumentFilterOptions>) => {
    setFiltersState((current) => ({ ...current, ...next }))
  }, [])

  const visibleEntries = useMemo(() => filterAndSortDocuments(entries, filters), [entries, filters])

  return { entries, visibleEntries, loading, error, refetch, remove, filters, setFilters }
}

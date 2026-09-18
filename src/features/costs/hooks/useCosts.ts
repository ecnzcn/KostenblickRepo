import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CostEntry } from '../../../domain/models/entities'
import { deleteCostEntry, getCostEntryYears, listCostEntries, listCostEntriesByYear } from '../../../domain/usecases/costs'
import { DEFAULT_COST_FILTERS, type CostFilterOptions } from '../costFilters'

interface UseCostsResult {
  entries: CostEntry[]
  years: number[]
  selectedYear: number
  setSelectedYear: (year: number) => void
  entriesForYear: CostEntry[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
  filters: CostFilterOptions
  setFilters: (next: Partial<CostFilterOptions>) => void
}

/** Loads every CostEntry exactly once and derives years/entries-for-year in
 * memory (useMemo) - switching the year filter never re-queries IndexedDB.
 * Same shape as useWasteCosts; the initial year auto-jumps to the most
 * recent year with data (same behavior as useCostOverviewData/
 * useStatisticsData) instead of silently showing an empty current year. */
export function useCosts(): UseCostsResult {
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getUTCFullYear())
  const hasAutoSelected = useRef(false)
  const [filters, setFiltersState] = useState<CostFilterOptions>(DEFAULT_COST_FILTERS)

  useEffect(() => {
    let cancelled = false
    listCostEntries()
      .then((result) => {
        if (cancelled) return
        setEntries(result)
        setError(undefined)
        if (!hasAutoSelected.current) {
          hasAutoSelected.current = true
          const availableYears = getCostEntryYears(result)
          if (availableYears.length > 0) {
            setSelectedYear((current) => (availableYears.includes(current) ? current : Math.max(...availableYears)))
          }
        }
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
      await deleteCostEntry(id)
      refetch()
    },
    [refetch],
  )

  const setFilters = useCallback((next: Partial<CostFilterOptions>) => {
    setFiltersState((current) => ({ ...current, ...next }))
  }, [])

  const years = useMemo(() => getCostEntryYears(entries), [entries])
  const entriesForYear = useMemo(() => listCostEntriesByYear(entries, selectedYear), [entries, selectedYear])

  return {
    entries,
    years,
    selectedYear,
    setSelectedYear,
    entriesForYear,
    loading,
    error,
    refetch,
    remove,
    filters,
    setFilters,
  }
}

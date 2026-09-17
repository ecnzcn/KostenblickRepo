import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WasteCost } from '../../../domain/models/entities'
import {
  deleteWasteCost,
  getWasteCostSummary,
  getWasteCostYears,
  listWasteCosts,
  listWasteCostsByYear,
  type WasteCostYearSummary,
} from '../../../domain/usecases/wasteCosts'

interface UseWasteCostsResult {
  wasteCosts: WasteCost[]
  years: number[]
  selectedYear: number
  setSelectedYear: (year: number) => void
  entriesForYear: WasteCost[]
  summary: WasteCostYearSummary
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
}

/** Loads every WasteCost exactly once and derives years/entries-per-year/
 * summary from it in memory (useMemo) - switching the year filter never
 * re-queries IndexedDB. */
export function useWasteCosts(): UseWasteCostsResult {
  const [wasteCosts, setWasteCosts] = useState<WasteCost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedYear, setSelectedYear] = useState(() => new Date().getUTCFullYear())

  useEffect(() => {
    let cancelled = false
    listWasteCosts()
      .then((result) => {
        if (cancelled) return
        setWasteCosts(result)
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
      await deleteWasteCost(id)
      refetch()
    },
    [refetch],
  )

  const years = useMemo(() => getWasteCostYears(wasteCosts), [wasteCosts])
  const entriesForYear = useMemo(
    () => listWasteCostsByYear(wasteCosts, selectedYear).sort((a, b) => a.category.localeCompare(b.category)),
    [wasteCosts, selectedYear],
  )
  const summary = useMemo(() => getWasteCostSummary(wasteCosts, selectedYear), [wasteCosts, selectedYear])

  return {
    wasteCosts,
    years,
    selectedYear,
    setSelectedYear,
    entriesForYear,
    summary,
    loading,
    error,
    refetch,
    remove,
  }
}

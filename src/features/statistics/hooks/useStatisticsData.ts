import { useCallback, useEffect, useRef, useState } from 'react'
import { getStatisticsData } from '../../../domain/usecases/statistics/calculateStatistics'
import type { StatisticsData } from '../statistics.types'

interface UseStatisticsDataResult {
  data: StatisticsData | undefined
  loading: boolean
  error: Error | undefined
  year: number
  setYear: (year: number) => void
  refetch: () => void
}

/**
 * Loads statistics for one selected year, defaulting to the current
 * calendar year. If that year has no data but other years do, it
 * auto-switches once to the most recent year that actually has bills -
 * so opening the page doesn't show an empty state just because no bill
 * happens to exist for the current year yet. The auto-switch flag lives
 * in a ref (not state) since it's a one-time internal detail, not
 * something a re-render needs to react to.
 */
export function useStatisticsData(): UseStatisticsDataResult {
  const [year, setYearState] = useState(() => new Date().getFullYear())
  const [data, setData] = useState<StatisticsData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    let cancelled = false

    getStatisticsData(year)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(undefined)
        if (!hasAutoSelected.current && result.years.length > 0 && !result.years.includes(year)) {
          hasAutoSelected.current = true
          setYearState(Math.max(...result.years))
          return
        }
        hasAutoSelected.current = true
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught : new Error('Unbekannter Fehler'))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [year, reloadToken])

  const setYear = useCallback((newYear: number) => {
    setLoading(true)
    setError(undefined)
    setYearState(newYear)
  }, [])

  const refetch = useCallback(() => {
    setLoading(true)
    setError(undefined)
    setReloadToken((token) => token + 1)
  }, [])

  return { data, loading, error, year, setYear, refetch }
}

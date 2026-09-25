import { useCallback, useEffect, useRef, useState } from 'react'
import { getCentralCostData } from '../../../domain/usecases/centralCosts'
import { calculateRunningContractCosts, listContracts } from '../../../domain/usecases/contracts'
import type { CentralCostData, RunningContractCosts } from '../costOverview.types'

interface UseCostOverviewDataResult {
  data: CentralCostData | undefined
  /** Contractual monthly/yearly cost of currently active contracts -
   * fetched separately from `data` since centralCosts.ts deliberately
   * never reads contracts (see calculateRunningContractCosts); undefined
   * only while still loading. */
  runningContractCosts: RunningContractCosts | undefined
  loading: boolean
  error: Error | undefined
  year: number
  setYear: (year: number) => void
  refetch: () => void
}

/** Same auto-select-most-recent-year behavior as useStatisticsData: opening
 * the page doesn't show an empty state just because the current calendar
 * year happens to have no data yet. */
export function useCostOverviewData(): UseCostOverviewDataResult {
  const [year, setYearState] = useState(() => new Date().getFullYear())
  const [data, setData] = useState<CentralCostData>()
  const [runningContractCosts, setRunningContractCosts] = useState<RunningContractCosts>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const hasAutoSelected = useRef(false)

  // Independent of `year` - "currently active" is always relative to today,
  // not the selected (possibly past) year being viewed - so this only
  // re-runs on an explicit refetch(), not on every year switch.
  useEffect(() => {
    let cancelled = false
    listContracts()
      .then((contracts) => {
        if (!cancelled) setRunningContractCosts(calculateRunningContractCosts(contracts))
      })
      .catch(() => {
        // Non-critical secondary figure - a failure here must not block or
        // error out the main cost overview, it just stays unset.
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    let cancelled = false

    getCentralCostData(year)
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

  return { data, runningContractCosts, loading, error, year, setYear, refetch }
}

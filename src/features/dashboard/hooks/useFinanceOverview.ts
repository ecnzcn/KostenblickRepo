import { useEffect, useMemo, useState } from 'react'
import {
  buildFinanceOverview,
  getFinanceData,
  type FinanceData,
  type FinanceOverview,
} from '../../../domain/usecases/finance/monthlyOverview'

interface UseFinanceOverviewResult {
  data: FinanceData | undefined
  overview: FinanceOverview | undefined
  month: string | undefined
  setMonth: (month: string) => void
  loading: boolean
  error: boolean
  refetch: () => void
}

/** Loads bookings once; switching the month only recomputes in memory. */
export function useFinanceOverview(today: string): UseFinanceOverviewResult {
  const [data, setData] = useState<FinanceData>()
  const [error, setError] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    getFinanceData()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const month = selectedMonth ?? data?.defaultMonth
  const overview = useMemo(() => (data && month ? buildFinanceOverview(data, month, today) : undefined), [data, month, today])

  return {
    data,
    overview,
    month,
    setMonth: setSelectedMonth,
    loading: !data && !error,
    error,
    refetch: () => {
      setError(false)
      setReloadToken((token) => token + 1)
    },
  }
}

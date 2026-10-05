import { useEffect, useMemo, useState } from 'react'
import {
  buildFinanceOverview,
  getFinanceData,
  type FinanceData,
  type FinanceOverview,
} from '../../../domain/usecases/finance/monthlyOverview'
import { calculateSavingsProgress, type SavingsProgress } from '../../../domain/usecases/finance/savingsGoal'
import { buildTips, type Tip } from '../../../domain/usecases/finance/tips'
import { contractDetailPath, ROUTES } from '../../../constants/navigation'

const TIP_LINKS = {
  transactions: (query: string) => (query ? `${ROUTES.transactions}?${query}` : ROUTES.transactions),
  contract: contractDetailPath,
}

interface UseFinanceOverviewResult {
  data: FinanceData | undefined
  overview: FinanceOverview | undefined
  savingsProgress: SavingsProgress | undefined
  tips: Tip[]
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
  const savingsProgress = useMemo(
    () => (overview && data?.savingsGoal ? calculateSavingsProgress(overview.totals, data.savingsGoal.monthlyTarget) : undefined),
    [overview, data],
  )
  const tips = useMemo(() => (data && month ? buildTips(data, month, today, TIP_LINKS) : []), [data, month, today])

  return {
    data,
    overview,
    savingsProgress,
    tips,
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

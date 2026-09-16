import { useCallback, useEffect, useState } from 'react'
import { getDashboardData } from '../../../domain/usecases/dashboard'
import type { DashboardData } from '../dashboard.types'

interface UseDashboardDataResult {
  data: DashboardData | undefined
  loading: boolean
  error: Error | undefined
  refetch: () => void
}

export function useDashboardData(): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    getDashboardData()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(undefined)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught : new Error('Unbekannter Fehler'))
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

  return { data, loading, error, refetch }
}

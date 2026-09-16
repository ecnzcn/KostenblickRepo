import { useCallback, useEffect, useState } from 'react'
import type { CostEntry } from '../../../domain/models/entities'
import { deleteCostEntry, listCostEntries } from '../../../domain/usecases/costs'

interface UseCostsResult {
  entries: CostEntry[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
}

export function useCosts(): UseCostsResult {
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listCostEntries()
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
      await deleteCostEntry(id)
      refetch()
    },
    [refetch],
  )

  return { entries, loading, error, refetch, remove }
}

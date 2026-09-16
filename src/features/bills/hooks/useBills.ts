import { useCallback, useEffect, useState } from 'react'
import type { Bill } from '../../../domain/models/entities'
import { deleteBillWithItems, listBills } from '../../../domain/usecases/bills'

interface UseBillsResult {
  bills: Bill[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
}

export function useBills(): UseBillsResult {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listBills()
      .then((result) => {
        if (cancelled) return
        setBills(result)
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
      await deleteBillWithItems(id)
      refetch()
    },
    [refetch],
  )

  return { bills, loading, error, refetch, remove }
}

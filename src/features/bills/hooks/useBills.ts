import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Bill } from '../../../domain/models/entities'
import { deleteBillWithItems, listBills } from '../../../domain/usecases/bills'
import { DEFAULT_BILL_FILTERS, filterAndSortBills, getBillYears, type BillFilterOptions } from '../billFilters'

interface UseBillsResult {
  bills: Bill[]
  visibleBills: Bill[]
  years: number[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
  filters: BillFilterOptions
  setFilters: (next: Partial<BillFilterOptions>) => void
}

export function useBills(): UseBillsResult {
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const [filters, setFiltersState] = useState<BillFilterOptions>(DEFAULT_BILL_FILTERS)

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

  const setFilters = useCallback((next: Partial<BillFilterOptions>) => {
    setFiltersState((current) => ({ ...current, ...next }))
  }, [])

  const years = useMemo(() => getBillYears(bills), [bills])
  const visibleBills = useMemo(() => filterAndSortBills(bills, filters), [bills, filters])

  return { bills, visibleBills, years, loading, error, refetch, remove, filters, setFilters }
}

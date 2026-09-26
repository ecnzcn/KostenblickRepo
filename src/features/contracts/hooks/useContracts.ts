import { useCallback, useEffect, useState } from 'react'
import type { Contract } from '../../../domain/models/entities'
import { deleteContract, listContracts } from '../../../domain/usecases/contracts'
import { DEFAULT_CONTRACT_FILTERS, type ContractFilterOptions } from '../contractFilters'

interface UseContractsResult {
  contracts: Contract[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
  filters: ContractFilterOptions
  setFilters: (next: Partial<ContractFilterOptions>) => void
}

/** Loads every Contract exactly once - search/filter/sort are pure,
 * in-memory derivations over this list (see contractFilters.ts), applied
 * by the page component (same shape as useCosts()/useBills()) rather than
 * memoized here, since the category lookup they need lives with
 * useCategories() in the page. */
export function useContracts(): UseContractsResult {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)
  const [filters, setFiltersState] = useState<ContractFilterOptions>(DEFAULT_CONTRACT_FILTERS)

  useEffect(() => {
    let cancelled = false
    listContracts()
      .then((result) => {
        if (cancelled) return
        setContracts(result)
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
      await deleteContract(id)
      refetch()
    },
    [refetch],
  )

  const setFilters = useCallback((next: Partial<ContractFilterOptions>) => {
    setFiltersState((current) => ({ ...current, ...next }))
  }, [])

  return { contracts, loading, error, refetch, remove, filters, setFilters }
}

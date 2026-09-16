import { useCallback, useEffect, useState } from 'react'
import type { Contract } from '../../../domain/models/entities'
import { deleteContract, listContracts } from '../../../domain/usecases/contracts'
import { daysUntil } from '../../../utils/date'

function sortByUpcomingDeadline(contracts: Contract[]): Contract[] {
  const now = new Date()
  const daysRemaining = (contract: Contract): number | undefined =>
    contract.calculatedCancellationDate ? daysUntil(contract.calculatedCancellationDate, now) : undefined

  return [...contracts].sort((a, b) => {
    const aDays = daysRemaining(a)
    const bDays = daysRemaining(b)
    const aRelevant = aDays !== undefined && aDays >= 0
    const bRelevant = bDays !== undefined && bDays >= 0
    if (aRelevant && bRelevant) return aDays - bDays
    if (aRelevant) return -1
    if (bRelevant) return 1
    return a.provider.localeCompare(b.provider)
  })
}

interface UseContractsResult {
  contracts: Contract[]
  loading: boolean
  error: Error | undefined
  refetch: () => void
  remove: (id: string) => Promise<void>
}

export function useContracts(): UseContractsResult {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    listContracts()
      .then((result) => {
        if (cancelled) return
        setContracts(sortByUpcomingDeadline(result))
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

  return { contracts, loading, error, refetch, remove }
}

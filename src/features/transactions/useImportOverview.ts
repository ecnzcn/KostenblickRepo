import { useEffect, useState } from 'react'
import { getImportOverview, type ImportOverview } from '../../domain/usecases/bankImport/importTransactions'
import { getFinanceData, type FinanceData } from '../../domain/usecases/finance/monthlyOverview'

export function useImportOverview(): {
  overview: ImportOverview | null
  error: boolean
  reload: () => void
} {
  const [overview, setOverview] = useState<ImportOverview | null>(null)
  const [error, setError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    getImportOverview()
      .then((result) => {
        if (cancelled) return
        setOverview(result)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return { overview, error, reload: () => setReloadToken((token) => token + 1) }
}

/** Bookings and categories for the list; reloads whenever the import
 * overview was reloaded (e.g. after undoing an import). */
export function useTransactionData(overview: ImportOverview | null): { data: FinanceData | null; error: boolean } {
  const [data, setData] = useState<FinanceData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!overview) return
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
  }, [overview])

  return { data, error }
}

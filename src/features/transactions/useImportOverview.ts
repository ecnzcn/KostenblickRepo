import { useEffect, useState } from 'react'
import { getImportOverview, type ImportOverview } from '../../domain/usecases/bankImport/importTransactions'

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

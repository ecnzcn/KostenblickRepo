import { useCallback, useEffect, useState } from 'react'
import { dismissReminder, getRemindersOverview } from '../../../domain/usecases/reminders/reminderQueries'
import type { RemindersOverview } from '../reminders.types'

interface UseRemindersResult {
  overview: RemindersOverview | undefined
  loading: boolean
  error: Error | undefined
  refetch: () => void
  dismiss: (id: string) => Promise<void>
}

export function useReminders(): UseRemindersResult {
  const [overview, setOverview] = useState<RemindersOverview>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    getRemindersOverview()
      .then((result) => {
        if (cancelled) return
        setOverview(result)
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

  const dismiss = useCallback(
    async (id: string) => {
      await dismissReminder(id)
      refetch()
    },
    [refetch],
  )

  return { overview, loading, error, refetch, dismiss }
}

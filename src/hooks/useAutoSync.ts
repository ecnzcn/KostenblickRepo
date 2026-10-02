import { useCallback, useEffect, useRef, useState } from 'react'
import { runSync, SYNC_FINISHED_EVENT } from '../services/sync/syncService'
import type { SyncRunResult } from '../services/sync/syncTypes'

const MIN_INTERVAL_MS = 30_000

/**
 * Background-free sync for an iOS PWA (no Background Sync there): a pass on
 * app start, whenever the app returns to the foreground or the device comes
 * back online - at most every 30 s. runSync() itself is a no-op until sync
 * is set up, so this costs nothing on an unconfigured device.
 *
 * When a pass brought in changes from another device, the open page is not
 * swapped out under the user's hands (they may be mid-form); instead
 * `hasRemoteChanges` asks for an explicit refresh, which remounts the
 * routes via `dataVersion` so every page reloads from IndexedDB.
 */
export function useAutoSync() {
  const [hasRemoteChanges, setHasRemoteChanges] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const lastAttempt = useRef(0)

  const trigger = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastAttempt.current < MIN_INTERVAL_MS) return
    lastAttempt.current = now
    void runSync()
  }, [])

  useEffect(() => {
    trigger(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    const onOnline = () => trigger(true)
    const onFinished = (event: Event) => {
      const result = (event as CustomEvent<SyncRunResult>).detail
      if (result && result.pulled > 0) setHasRemoteChanges(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener(SYNC_FINISHED_EVENT, onFinished)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(SYNC_FINISHED_EVENT, onFinished)
    }
  }, [trigger])

  const applyRemoteChanges = useCallback(() => {
    setHasRemoteChanges(false)
    setDataVersion((version) => version + 1)
  }, [])

  const dismissRemoteChanges = useCallback(() => setHasRemoteChanges(false), [])

  return { hasRemoteChanges, applyRemoteChanges, dismissRemoteChanges, dataVersion }
}

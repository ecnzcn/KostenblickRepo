import { useRegisterSW } from 'virtual:pwa-register/react'

export interface PwaUpdateState {
  /** True once vite-plugin-pwa detects a new, already-installed service
   * worker waiting to take over - the same signal it uses internally,
   * never a custom version check. */
  needRefresh: boolean
  /** Confirms the update: sends the waiting service worker a skip-waiting
   * message. The reload itself is handled by vite-plugin-pwa's own
   * 'controlling' listener (see registerSW's default onNeedReload), not by
   * this app - no separate reload logic is implemented here. */
  updateNow: () => Promise<void>
  /** "Später": hides the hint for this session without touching the
   * waiting service worker. If another update is detected later, the hint
   * can reappear - nothing here is persisted to IndexedDB/localStorage. */
  dismiss: () => void
}

/**
 * Thin wrapper around vite-plugin-pwa's own React registration hook
 * (`virtual:pwa-register/react`) - the *only* place in the app that
 * imports this Vite virtual module, so `PwaUpdateBanner` (all the actual
 * UI/interaction logic) can be tested with plain props instead of needing
 * to resolve or mock a Vite-only virtual module. Registering more than
 * once would mean more than one service worker registration for the same
 * app, so this hook must be called exactly once (see App.tsx).
 */
export function usePwaUpdate(): PwaUpdateState {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  return {
    needRefresh,
    updateNow: () => updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  }
}

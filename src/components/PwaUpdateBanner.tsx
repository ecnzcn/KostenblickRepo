import { useState } from 'react'

interface PwaUpdateBannerProps {
  needRefresh: boolean
  onUpdate: () => void | Promise<void>
  onDismiss: () => void
}

/**
 * A small, persistent hint that a new Kostenblick version is ready -
 * deliberately not built on the existing Toast system (ToastProvider),
 * since a Toast auto-dismisses after a few seconds and carries no action
 * buttons; this needs to stay visible until the user actually decides,
 * and offer two real actions ("Jetzt aktualisieren"/"Später"). Renders
 * nothing at all unless needRefresh is true, so it never occupies layout
 * space or blocks the screen otherwise. Only one instance of this is ever
 * mounted (see App.tsx), so it can never stack/appear twice.
 */
export function PwaUpdateBanner({ needRefresh, onUpdate, onDismiss }: PwaUpdateBannerProps) {
  const [updating, setUpdating] = useState(false)

  if (!needRefresh) return null

  async function handleUpdate() {
    setUpdating(true)
    await onUpdate()
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div
        role="status"
        className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg lg:max-w-lg"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900">Neue Version verfügbar</p>
          <p className="text-xs text-neutral-500">
            {updating ? 'Kostenblick wird aktualisiert …' : 'Kostenblick kann aktualisiert werden.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={updating}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 disabled:opacity-60"
          >
            Später
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className="min-h-11 rounded-xl bg-accent px-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {updating ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface SyncChangesBannerProps {
  visible: boolean
  onApply: () => void
  onDismiss: () => void
}

/** Shown after a sync brought in changes from another device - the user
 * decides when the open page reloads (same look as PwaUpdateBanner). */
export function SyncChangesBanner({ visible, onApply, onDismiss }: SyncChangesBannerProps) {
  if (!visible) return null
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
          <p className="text-sm font-medium text-neutral-900">Neue Daten synchronisiert</p>
          <p className="text-xs text-neutral-500">Von einem anderen Gerät wurden Änderungen übernommen.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700"
          >
            Später
          </button>
          <button type="button" onClick={onApply} className="min-h-11 rounded-xl bg-accent px-3 text-sm font-medium text-white">
            Anzeigen
          </button>
        </div>
      </div>
    </div>
  )
}

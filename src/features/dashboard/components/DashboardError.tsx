interface DashboardErrorProps {
  onRetry: () => void
}

export function DashboardError({ onRetry }: DashboardErrorProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
      <p className="text-sm text-red-700">Die Kostendaten konnten nicht geladen werden.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
      >
        Erneut versuchen
      </button>
    </div>
  )
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-neutral-200/70 ${className}`} />
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Dashboard wird geladen" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-32" />
      </div>
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-40" />
      <SkeletonBlock className="h-40" />
    </div>
  )
}

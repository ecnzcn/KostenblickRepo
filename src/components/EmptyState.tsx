interface EmptyStateProps {
  message: string
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
      <p className="text-sm text-neutral-500">{message}</p>
    </div>
  )
}

interface ImportProcessingStepProps {
  message: string
}

/** Indeterminate loading state on purpose - OCR duration can't be predicted,
 * so a fake percentage bar would just lie. */
export function ImportProcessingStep({ message }: ImportProcessingStepProps) {
  return (
    <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-accent" />
      <p className="text-sm text-neutral-600">{message}</p>
    </div>
  )
}

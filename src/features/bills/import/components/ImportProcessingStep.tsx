import type { OCRProgress } from '../../../../services/ocr/OCRService'

interface ImportProcessingStepProps {
  progress: OCRProgress
  onCancel: () => void
}

const STAGE_FALLBACK_MESSAGE: Record<OCRProgress['stage'], string> = {
  loading: 'OCR-Modul wird geladen …',
  extracting: 'Dokument wird gelesen …',
  rendering: 'Seite wird vorbereitet …',
  recognizing: 'Text wird erkannt …',
  parsing: 'Kostenpositionen werden analysiert …',
  complete: 'Fertig.',
}

/** Indeterminate by default - a real progress bar only appears once
 * `current`/`total` are genuinely known (e.g. "page 2 of 4", or Tesseract's
 * own measured recognition progress). Never a fabricated percentage. */
export function ImportProcessingStep({ progress, onCancel }: ImportProcessingStepProps) {
  const message = progress.message ?? STAGE_FALLBACK_MESSAGE[progress.stage]
  const hasRealProgress = progress.current !== undefined && progress.total !== undefined && progress.total > 0
  const percent = hasRealProgress ? Math.min(100, Math.round(((progress.current ?? 0) / (progress.total ?? 1)) * 100)) : undefined

  return (
    <div role="status" aria-label="Verarbeitung" className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
      {hasRealProgress ? (
        <div className="w-full max-w-xs">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : (
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-accent" />
      )}
      <p className="text-sm text-neutral-600">{message}</p>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-xl border border-neutral-300 bg-white px-5 text-sm font-medium text-neutral-700"
      >
        Abbrechen
      </button>
    </div>
  )
}

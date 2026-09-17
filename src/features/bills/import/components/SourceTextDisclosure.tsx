interface SourceTextDisclosureProps {
  sourceText?: string
}

/** Optional accordion showing the OCR text snippet a recognized value came
 * from, so a user can check "why does it say that" without cluttering the
 * default view. */
export function SourceTextDisclosure({ sourceText }: SourceTextDisclosureProps) {
  if (!sourceText) return null
  return (
    <details className="mt-1 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none py-1">Erkannter Text anzeigen</summary>
      <p className="mt-1 rounded-lg bg-neutral-50 p-2 font-mono text-[11px] leading-relaxed text-neutral-600">
        {sourceText}
      </p>
    </details>
  )
}

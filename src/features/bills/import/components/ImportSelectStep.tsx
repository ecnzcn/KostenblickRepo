import { useRef } from 'react'
import { ACCEPTED_DOCUMENT_INPUT_ACCEPT } from '../../../../constants/files'
import { FormError } from '../../../../components/form/fields'
import { formatFileSize } from '../../../../utils/formatters'

interface ImportSelectStepProps {
  file: File | undefined
  error: string | undefined
  onSelect: (file: File | undefined) => void
  onCancel: () => void
  onContinue: () => void
}

export function ImportSelectStep({ file, error, onSelect, onCancel, onContinue }: ImportSelectStepProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Wähle eine PDF-Datei oder ein Foto deiner Abrechnung aus. Die erkannten Werte kannst du im nächsten Schritt
        prüfen und korrigieren.
      </p>

      <FormError errors={error ? [error] : []} />

      <label
        htmlFor="import-file-input"
        className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-6 text-center"
      >
        <span className="text-sm font-medium text-accent">Datei auswählen</span>
        <span className="text-xs text-neutral-500">PDF, JPEG, PNG oder WebP, max. 20 MB</span>
        <input
          ref={inputRef}
          id="import-file-input"
          type="file"
          accept={ACCEPTED_DOCUMENT_INPUT_ACCEPT}
          className="sr-only"
          onChange={(event) => onSelect(event.target.files?.[0])}
        />
      </label>

      {file ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
          <p className="break-words font-medium text-neutral-900">{file.name}</p>
          <p className="text-neutral-500">
            {formatFileSize(file.size)} · {file.type || 'unbekannter Dateityp'}
          </p>
        </div>
      ) : null}

      <div className="sticky bottom-20 z-10 -mx-4 flex gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-none lg:bg-transparent lg:p-0">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!file || !!error}
          className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-60"
        >
          Weiter
        </button>
      </div>
    </div>
  )
}

import type { ParsedBill } from '../../domain/models/ocr'

export interface OCRTextResult {
  rawText: string
  confidence: number
}

export interface OCRFieldResult<T = string> {
  field: string
  value: T
  confidence: number
  sourceText: string
}

export interface OCRAnalysisResult {
  rawText: string
  confidence: number
  fields: OCRFieldResult[]
}

/**
 * A real progress report, not a fabricated percentage: `current`/`total`
 * are only set when genuinely known (e.g. "page 2 of 4"). When they are
 * absent the UI must show an indeterminate state, never a guessed number.
 */
export interface OCRProgress {
  stage: 'loading' | 'extracting' | 'rendering' | 'recognizing' | 'parsing' | 'complete'
  current?: number
  total?: number
  message?: string
}

export interface OCROptions {
  onProgress?: (progress: OCRProgress) => void
  /** Lets the caller cancel a still-running extraction (e.g. the user hits
   * "Abbrechen" on the processing screen). Implementations must stop as
   * soon as practical and release any worker/canvas/Blob-URL resources. */
  signal?: AbortSignal
}

/**
 * The only way the rest of the app talks to OCR. The UI and use cases only
 * ever depend on this interface, never on a concrete provider - swapping
 * one implementation for another (on-device Vision, a cloud API, an own
 * backend) is a matter of changing which class `ocrService.ts` wires up,
 * not touching any caller. `options` is optional on every method so this
 * stays a strict extension of the original Phase 4 interface.
 */
export interface OCRService {
  extractText(file: Blob, options?: OCROptions): Promise<OCRTextResult>
  analyzeDocument(file: Blob, options?: OCROptions): Promise<OCRAnalysisResult>
  extractBillData(file: Blob, options?: OCROptions): Promise<ParsedBill>
  /** Releases any resources an implementation may be holding onto (e.g. a
   * background worker and its WASM memory). Optional - a provider with
   * nothing to release (like MockOCRService) simply omits it. The UI calls
   * this without knowing what, if anything, it does. */
  dispose?(): Promise<void>
}

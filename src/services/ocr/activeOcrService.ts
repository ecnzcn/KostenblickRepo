import type { ParsedBill } from '../../domain/models/ocr'
import type { OCRAnalysisResult, OCROptions, OCRService, OCRTextResult } from './OCRService'

/**
 * The one place that decides which OCRService implementation the app
 * actually runs. Every caller (UI, use cases) imports `ocrService` from
 * here and only ever sees the `OCRService` interface - never
 * `LocalOCRService`/`Tesseract`/`pdfjs-dist` directly. Tests that want the
 * old fixed-text behavior import `MockOCRService` directly instead (see
 * `MockOCRService.ts`), which still fully implements `OCRService`.
 *
 * `LocalOCRService` (and the multi-hundred-KB `tesseract.js`/`pdfjs-dist`
 * it pulls in) is loaded via a dynamic import the first time OCR actually
 * runs, not eagerly here - most screens in the app (dashboard, costs,
 * contracts, ...) never touch OCR and should not pay for it in their
 * initial bundle.
 */
let implPromise: Promise<OCRService> | undefined

function getImplementation(): Promise<OCRService> {
  implPromise ??= import('./LocalOCRService').then((module) => new module.LocalOCRService())
  return implPromise
}

export const ocrService: OCRService = {
  async extractText(file: Blob, options?: OCROptions): Promise<OCRTextResult> {
    const impl = await getImplementation()
    return impl.extractText(file, options)
  },
  async analyzeDocument(file: Blob, options?: OCROptions): Promise<OCRAnalysisResult> {
    const impl = await getImplementation()
    return impl.analyzeDocument(file, options)
  },
  async extractBillData(file: Blob, options?: OCROptions): Promise<ParsedBill> {
    const impl = await getImplementation()
    return impl.extractBillData(file, options)
  },
  async dispose(): Promise<void> {
    const impl = await implPromise
    await impl?.dispose?.()
  },
}

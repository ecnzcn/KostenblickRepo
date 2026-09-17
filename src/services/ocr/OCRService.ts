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
 * The only way the rest of the app talks to OCR. The UI and use cases only
 * ever depend on this interface, never on a concrete provider - swapping
 * MockOCRService for a real one (on-device Vision, a cloud API, an own
 * backend) later is a matter of changing which implementation gets wired up
 * (see `ocrService` in `MockOCRService.ts`), not touching any caller.
 */
export interface OCRService {
  extractText(file: Blob): Promise<OCRTextResult>
  analyzeDocument(file: Blob): Promise<OCRAnalysisResult>
  extractBillData(file: Blob): Promise<ParsedBill>
}

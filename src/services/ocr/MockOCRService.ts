import { parseBillText } from '../../domain/usecases/billParser'
import { categoryRepository } from '../../domain/repositories/categories'
import type { OCRAnalysisResult, OCROptions, OCRService, OCRTextResult } from './OCRService'
import type { ParsedBill } from '../../domain/models/ocr'
import { toFieldSummary } from './parsedBillFields'

/**
 * Development/test stand-in for a real OCR provider. It does NOT read the
 * actual bytes of the uploaded file - there is no real text recognition
 * happening here. It always returns the same plausible German
 * Nebenkostenabrechnung text, deterministically and instantly, so tests and
 * ad-hoc manual checks don't depend on running the real (slower,
 * WASM-based) `LocalOCRService`. This must never be presented to a user as
 * genuine OCR output; every value it produces still goes through the same
 * confidence/review flow as a real provider would.
 *
 * Not used by the app itself - `services/ocr/ocrService.ts` is the single
 * place that decides which OCRService implementation is actually wired up
 * (currently `LocalOCRService`). Import `MockOCRService` directly only in
 * tests that want this fixed, fast behavior.
 */
const MOCK_BILL_RAW_TEXT = `Nebenkostenabrechnung
Abrechnungsjahr 2025
Abrechnungszeitraum: 01.01.2025 bis 31.12.2025

Kostenpositionen
Heizkosten            850,00 €
Wasser/Abwasser       320,00 €
Müllabfuhr             180,00 €
Hausmeister            240,00 €
Gebäudereinigung       150,00 €
Versicherung           200,00 €

Gesamtkosten: 1.940,00 €
Vorauszahlungen: 2.100,00 €
Guthaben: 160,00 €`

export class MockOCRService implements OCRService {
  async extractText(_file: Blob, _options?: OCROptions): Promise<OCRTextResult> {
    return { rawText: MOCK_BILL_RAW_TEXT, confidence: 0.9 }
  }

  async analyzeDocument(file: Blob, options?: OCROptions): Promise<OCRAnalysisResult> {
    const { rawText, confidence } = await this.extractText(file, options)
    const categories = await categoryRepository.getAll()
    const parsed = parseBillText(rawText, categories)
    return { rawText, confidence, fields: toFieldSummary(parsed) }
  }

  async extractBillData(file: Blob, options?: OCROptions): Promise<ParsedBill> {
    const { rawText } = await this.extractText(file, options)
    const categories = await categoryRepository.getAll()
    return parseBillText(rawText, categories)
  }
}

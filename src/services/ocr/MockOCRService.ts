import { parseBillText } from '../../domain/usecases/billParser'
import { categoryRepository } from '../../domain/repositories/categories'
import type { OCRAnalysisResult, OCRFieldResult, OCRService, OCRTextResult } from './OCRService'
import type { ParsedBill } from '../../domain/models/ocr'

/**
 * Development/test stand-in for a real OCR provider. It does NOT read the
 * actual bytes of the uploaded file - there is no real text recognition
 * happening here. It always returns the same plausible German
 * Nebenkostenabrechnung text so the rest of the import pipeline (parser,
 * review UI, persistence) can be built and tested end-to-end before a real
 * OCR backend exists. This must never be presented to a user as genuine
 * OCR output; every value it produces still goes through the same
 * confidence/review flow as a real provider would.
 *
 * Swapping in a real provider later (on-device Vision, a cloud API, an own
 * backend) means writing a new class that implements `OCRService` and
 * changing the `ocrService` export below - no caller changes.
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
  async extractText(_file: Blob): Promise<OCRTextResult> {
    return { rawText: MOCK_BILL_RAW_TEXT, confidence: 0.9 }
  }

  async analyzeDocument(file: Blob): Promise<OCRAnalysisResult> {
    const { rawText, confidence } = await this.extractText(file)
    const categories = await categoryRepository.getAll()
    const parsed = parseBillText(rawText, categories)

    const fields: OCRFieldResult[] = []
    if (parsed.year.value !== undefined) {
      fields.push({ field: 'year', value: String(parsed.year.value), confidence: parsed.year.confidence, sourceText: parsed.year.sourceText ?? '' })
    }
    if (parsed.totalAmount.value !== undefined) {
      fields.push({
        field: 'totalAmount',
        value: String(parsed.totalAmount.value),
        confidence: parsed.totalAmount.confidence,
        sourceText: parsed.totalAmount.sourceText ?? '',
      })
    }
    if (parsed.advancePayments.value !== undefined) {
      fields.push({
        field: 'advancePayments',
        value: String(parsed.advancePayments.value),
        confidence: parsed.advancePayments.confidence,
        sourceText: parsed.advancePayments.sourceText ?? '',
      })
    }

    return { rawText, confidence, fields }
  }

  async extractBillData(file: Blob): Promise<ParsedBill> {
    const { rawText } = await this.extractText(file)
    const categories = await categoryRepository.getAll()
    return parseBillText(rawText, categories)
  }
}

export const ocrService: OCRService = new MockOCRService()

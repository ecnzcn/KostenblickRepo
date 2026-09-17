import type { ParsedBill } from '../../domain/models/ocr'
import type { OCRFieldResult } from './OCRService'

/** Turns a ParsedBill's per-field results into the generic OCRFieldResult
 * shape `analyzeDocument` reports - shared so every OCRService
 * implementation summarizes fields the same way. */
export function toFieldSummary(parsed: ParsedBill): OCRFieldResult[] {
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
  return fields
}

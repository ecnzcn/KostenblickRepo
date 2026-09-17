import type { BillType } from './entities'

/** A single recognized value plus the OCR/parser metadata the review UI
 * needs: how sure the recognition was, and (optionally) the text snippet it
 * came from, so a user can check "why does it say that". */
export interface ParsedField<T> {
  value: T
  confidence: number
  sourceText?: string
}

export interface ParsedBillItem {
  categoryId: string
  description: string
  amount: number
  confidence: number
  sourceText?: string
}

/** Internal result of running OCR text through the Bill Parser. Never
 * persisted as-is - the review screen turns this into a BillInput only once
 * the user explicitly confirms it (see confirmBillImport). */
export interface ParsedBill {
  type: BillType
  year: ParsedField<number | undefined>
  periodStart: ParsedField<string | undefined>
  periodEnd: ParsedField<string | undefined>
  totalAmount: ParsedField<number | undefined>
  advancePayments: ParsedField<number | undefined>
  items: ParsedBillItem[]
  rawText: string
}

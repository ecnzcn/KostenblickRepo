/** Result types of the bank CSV parser (Phase 14C). Nothing here is
 * persisted - a parsed statement becomes Transactions only in the import
 * flow, after the user confirmed the preview. */

export type BankStatementFormat = 'sparkasse_giro' | 'sparkasse_credit_card'

/** Structural marker for credit card rows, used later for pairing and
 * classification. Giro rows keep the bank's own Buchungstext. */
export const CREDIT_CARD_BOOKING_TEXT = {
  purchase: 'KARTENUMSATZ',
  settlement: 'LASTSCHRIFT',
  fee: 'GEBUEHR',
} as const

export interface ParsedBankRow {
  /** Line in the file where the record starts (header = line 1). */
  line: number
  /** The record exactly as in the file, by column name. */
  raw: Record<string, string>
  /** YYYY-MM-DD */
  bookingDate: string
  valueDate?: string
  purchaseDate?: string
  amount: number
  currency: string
  counterpartyName: string
  counterpartyIban?: string
  purpose: string
  bookingText: string
  creditorId?: string
  mandateReference?: string
  endToEndReference?: string
  bankCategory?: string
  originalAmount?: number
  originalCurrency?: string
  exchangeRate?: number
  /** Card booking reference (credit card only). */
  bookingReference?: string
  /** Merchant category code ("Gebührenschlüssel", credit card only). */
  merchantCategoryCode?: string
}

export interface BankRowError {
  line: number
  message: string
}

export interface ParsedBankStatement {
  format: BankStatementFormat
  /** Giro: the account's IBAN (Auftragskonto). Credit card: the masked card
   * number as exported. Never stored - only its salted hash and last 4. */
  accountIdentifier: string
  /** Booked rows only, in file order. */
  rows: ParsedBankRow[]
  /** Rows marked "Umsatz vorgemerkt": never imported, only counted. */
  pendingCount: number
  /** A statement with row errors must not be imported (no partial imports). */
  errors: BankRowError[]
}

export type ParseBankStatementResult = { ok: true; statement: ParsedBankStatement } | { ok: false; error: string }

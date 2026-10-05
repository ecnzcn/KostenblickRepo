import {
  CREDIT_CARD_BOOKING_TEXT,
  type BankRowError,
  type BankStatementFormat,
  type ParseBankStatementResult,
  type ParsedBankRow,
} from '../../models/bankImport'
import { parseGermanAmount } from '../../../utils/money'
import { parseCsv } from './csv'

/**
 * Sparkasse CSV exports → ParsedBankStatement (Phase 14C, spec section 4/4b).
 * Pure: no IndexedDB, no network. Columns are always looked up by header
 * name, never by position - export variants drop optional columns.
 * Error messages name line and column but never a field's content (no
 * account data in messages, spec E10).
 */

const GIRO_COLUMNS = {
  account: 'Auftragskonto',
  bookingDate: 'Buchungstag',
  valueDate: 'Valutadatum',
  bookingText: 'Buchungstext',
  purpose: 'Verwendungszweck',
  creditorId: 'Glaeubiger ID',
  mandateReference: 'Mandatsreferenz',
  endToEndReference: 'Kundenreferenz (End-to-End)',
  counterpartyName: 'Beguenstigter/Zahlungspflichtiger',
  counterpartyIban: 'Kontonummer/IBAN',
  amount: 'Betrag',
  currency: 'Waehrung',
  info: 'Info',
  category: 'Kategorie',
} as const

const CREDIT_CARD_COLUMNS = {
  card: 'Umsatz getätigt von',
  purchaseDate: 'Belegdatum',
  bookingDate: 'Buchungsdatum',
  originalAmount: 'Originalbetrag',
  originalCurrency: 'Originalwährung',
  exchangeRate: 'Umrechnungskurs',
  amount: 'Buchungsbetrag',
  currency: 'Buchungswährung',
  description: 'Transaktionsbeschreibung',
  descriptionExtra: 'Transaktionsbeschreibung Zusatz',
  bookingReference: 'Buchungsreferenz',
  merchantCategoryCode: 'Gebührenschlüssel',
} as const

const REQUIRED_COLUMNS: Record<BankStatementFormat, readonly string[]> = {
  sparkasse_giro: [GIRO_COLUMNS.account, GIRO_COLUMNS.bookingDate, GIRO_COLUMNS.amount],
  sparkasse_credit_card: [
    CREDIT_CARD_COLUMNS.card,
    CREDIT_CARD_COLUMNS.bookingDate,
    CREDIT_CARD_COLUMNS.amount,
    CREDIT_CARD_COLUMNS.description,
  ],
}

const PENDING_INFO = 'Umsatz vorgemerkt'
/** SEPA placeholder for a missing end-to-end reference. */
const NOT_PROVIDED = 'NOTPROVIDED'

export const UNKNOWN_FORMAT_ERROR =
  'Diese Datei ist kein Sparkassen-Umsatzexport. Bitte im Online-Banking unter Umsätze → Export „Excel (CSV-CAMT V2)“ wählen oder den Kreditkarten-Export verwenden.'

function detectFormat(header: readonly string[]): BankStatementFormat | undefined {
  const score = (columns: Record<string, string>) => Object.values(columns).filter((name) => header.includes(name)).length
  const giro = score(GIRO_COLUMNS)
  const card = score(CREDIT_CARD_COLUMNS)
  if (Math.max(giro, card) < 3) return undefined
  return giro >= card ? 'sparkasse_giro' : 'sparkasse_credit_card'
}

/** TT.MM.JJ (Sparkasse) or TT.MM.JJJJ → YYYY-MM-DD; undefined if not a real date. */
export function parseBankDate(value: string): string | undefined {
  const match = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/.exec(value.trim())
  if (!match) return undefined
  const [, dd = '', mm = '', yy = ''] = match
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy)
  const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd)) {
    return undefined
  }
  return date.toISOString().slice(0, 10)
}

/** Strict German money format as exported: "-1234,56", "1.234,56". */
export function parseBankAmount(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^[+-]?(\d{1,3}(\.\d{3})+|\d+),\d{2}$/.test(trimmed)) return undefined
  return parseGermanAmount(trimmed) ?? undefined
}

/** Exchange rates keep every exported decimal - never rounded to cents. */
export function parseExchangeRate(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d+(,\d+)?$/.test(trimmed)) return undefined
  return Number(trimmed.replace(',', '.'))
}

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

type RowContext = {
  line: number
  get: (column: string) => string
  error: (message: string) => void
}

function requiredDate(context: RowContext, column: string): string | undefined {
  const date = parseBankDate(context.get(column))
  if (!date) context.error(`Spalte „${column}“ enthält kein gültiges Datum.`)
  return date
}

function optionalDate(context: RowContext, column: string): string | undefined {
  const raw = context.get(column).trim()
  if (!raw) return undefined
  const date = parseBankDate(raw)
  if (!date) context.error(`Spalte „${column}“ enthält kein gültiges Datum.`)
  return date
}

function requiredAmount(context: RowContext, column: string): number | undefined {
  const amount = parseBankAmount(context.get(column))
  if (amount === undefined) context.error(`Spalte „${column}“ enthält keinen gültigen Betrag.`)
  return amount
}

function parseGiroRow(context: RowContext, raw: Record<string, string>): { row?: ParsedBankRow; account?: string } {
  const account = normalizeIban(context.get(GIRO_COLUMNS.account))
  if (!account) context.error(`Spalte „${GIRO_COLUMNS.account}“ ist leer.`)
  const bookingDate = requiredDate(context, GIRO_COLUMNS.bookingDate)
  const valueDate = optionalDate(context, GIRO_COLUMNS.valueDate)
  const amount = requiredAmount(context, GIRO_COLUMNS.amount)
  if (!bookingDate || amount === undefined || !account) return { account: account || undefined }

  const endToEnd = optional(context.get(GIRO_COLUMNS.endToEndReference))
  const counterpartyIban = normalizeIban(context.get(GIRO_COLUMNS.counterpartyIban))
  return {
    account,
    row: {
      line: context.line,
      raw,
      bookingDate,
      valueDate,
      amount,
      currency: optional(context.get(GIRO_COLUMNS.currency)) ?? 'EUR',
      counterpartyName: context.get(GIRO_COLUMNS.counterpartyName).trim(),
      counterpartyIban: counterpartyIban || undefined,
      purpose: context.get(GIRO_COLUMNS.purpose).trim(),
      bookingText: context.get(GIRO_COLUMNS.bookingText).trim(),
      creditorId: optional(context.get(GIRO_COLUMNS.creditorId)),
      mandateReference: optional(context.get(GIRO_COLUMNS.mandateReference)),
      endToEndReference: endToEnd === NOT_PROVIDED ? undefined : endToEnd,
      bankCategory: optional(context.get(GIRO_COLUMNS.category)),
    },
  }
}

function parseCreditCardRow(context: RowContext, raw: Record<string, string>): { row?: ParsedBankRow; account?: string } {
  const card = context.get(CREDIT_CARD_COLUMNS.card).replace(/\s+/g, ' ').trim()
  if (!card) context.error(`Spalte „${CREDIT_CARD_COLUMNS.card}“ ist leer.`)
  const bookingDate = requiredDate(context, CREDIT_CARD_COLUMNS.bookingDate)
  const purchaseDate = optionalDate(context, CREDIT_CARD_COLUMNS.purchaseDate)
  const amount = requiredAmount(context, CREDIT_CARD_COLUMNS.amount)

  // EUR rows carry "0,00"/"1,00" as placeholders - only a real foreign
  // currency makes these values meaningful (no invented values).
  const originalCurrency = optional(context.get(CREDIT_CARD_COLUMNS.originalCurrency))
  let originalAmount: number | undefined
  let exchangeRate: number | undefined
  if (originalCurrency) {
    originalAmount = parseBankAmount(context.get(CREDIT_CARD_COLUMNS.originalAmount))
    exchangeRate = parseExchangeRate(context.get(CREDIT_CARD_COLUMNS.exchangeRate))
    if (originalAmount === undefined) context.error(`Spalte „${CREDIT_CARD_COLUMNS.originalAmount}“ enthält keinen gültigen Betrag.`)
    if (exchangeRate === undefined) context.error(`Spalte „${CREDIT_CARD_COLUMNS.exchangeRate}“ enthält keinen gültigen Kurs.`)
  }
  if (!bookingDate || amount === undefined || !card) return { account: card || undefined }

  const description = context.get(CREDIT_CARD_COLUMNS.description).trim()
  const extra = context.get(CREDIT_CARD_COLUMNS.descriptionExtra).trim()
  const kind =
    description === 'Lastschrift' ? 'settlement' : /Währungsumrechnung/i.test(description) ? 'fee' : 'purchase'
  return {
    account: card,
    row: {
      line: context.line,
      raw,
      bookingDate,
      purchaseDate,
      amount,
      currency: optional(context.get(CREDIT_CARD_COLUMNS.currency)) ?? 'EUR',
      // A fee row names the merchant it belongs to in the extra field.
      counterpartyName: kind === 'fee' ? extra || description : kind === 'settlement' ? '' : description,
      purpose: kind === 'purchase' ? extra : description,
      bookingText: CREDIT_CARD_BOOKING_TEXT[kind],
      originalAmount,
      originalCurrency,
      exchangeRate,
      bookingReference: optional(context.get(CREDIT_CARD_COLUMNS.bookingReference)),
      merchantCategoryCode: optional(context.get(CREDIT_CARD_COLUMNS.merchantCategoryCode)),
    },
  }
}

export function parseSparkasseCsv(text: string): ParseBankStatementResult {
  const [headerRecord, ...dataRecords] = parseCsv(text)
  if (!headerRecord) return { ok: false, error: 'Die Datei ist leer.' }

  const header = headerRecord.fields.map((name) => name.trim())
  const format = detectFormat(header)
  if (!format) return { ok: false, error: UNKNOWN_FORMAT_ERROR }

  const missing = REQUIRED_COLUMNS[format].filter((column) => !header.includes(column))
  if (missing.length > 0) {
    const names = missing.map((column) => `„${column}“`).join(', ')
    return {
      ok: false,
      error: `In der Datei fehlt ${missing.length === 1 ? 'die Pflichtspalte' : 'die Pflichtspalten'} ${names}. Es wurde nichts importiert.`,
    }
  }

  const index = new Map(header.map((name, position) => [name, position]))
  const rows: ParsedBankRow[] = []
  const errors: BankRowError[] = []
  const accounts = new Set<string>()
  let pendingCount = 0

  for (const record of dataRecords) {
    const raw = Object.fromEntries(header.map((name, position) => [name, record.fields[position] ?? '']))
    const get = (column: string) => {
      const position = index.get(column)
      return position === undefined ? '' : (record.fields[position] ?? '')
    }
    if (record.fields.length !== header.length) {
      errors.push({ line: record.line, message: `Zeile ${record.line}: unerwartete Anzahl an Spalten.` })
      continue
    }
    if (format === 'sparkasse_giro' && get(GIRO_COLUMNS.info).trim() === PENDING_INFO) {
      pendingCount += 1
      continue
    }

    const context: RowContext = {
      line: record.line,
      get,
      error: (message) => errors.push({ line: record.line, message: `Zeile ${record.line}: ${message}` }),
    }
    const { row, account } = format === 'sparkasse_giro' ? parseGiroRow(context, raw) : parseCreditCardRow(context, raw)
    if (account) accounts.add(account)
    if (row) rows.push(row)
  }

  if (accounts.size > 1) {
    return {
      ok: false,
      error: 'Die Datei enthält Umsätze mehrerer Konten. Bitte für jedes Konto eine eigene Datei exportieren.',
    }
  }
  if (rows.length === 0 && pendingCount === 0 && errors.length === 0) {
    return { ok: false, error: 'Die Datei enthält keine Umsätze.' }
  }

  return { ok: true, statement: { format, accountIdentifier: [...accounts][0] ?? '', rows, pendingCount, errors } }
}

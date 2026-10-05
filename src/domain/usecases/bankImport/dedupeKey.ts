import type { BankStatementFormat, ParsedBankRow, ParsedBankStatement } from '../../models/bankImport'
import { sha256Hex } from '../../../utils/hash'

export type KeyedBankRow = ParsedBankRow & { dedupeKey: string }

/** Whitespace is removed entirely, not just collapsed: the bank wraps long
 * texts at fixed widths ("17.0 7.26"), and a differently wrapped export of
 * the same booking must still produce the same key. Display values keep the
 * original text. */
export function normalizeForKey(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

function keyFields(row: ParsedBankRow, format: BankStatementFormat, accountHash: string): string[] {
  if (format === 'sparkasse_giro') {
    return [
      accountHash,
      row.bookingDate,
      row.amount.toFixed(2),
      row.counterpartyIban ?? '',
      normalizeForKey(row.purpose),
      row.endToEndReference ?? '',
    ]
  }
  return [
    accountHash,
    row.purchaseDate ?? '',
    row.bookingDate,
    row.amount.toFixed(2),
    normalizeForKey(row.raw['Transaktionsbeschreibung'] ?? ''),
    row.bookingReference ?? '',
  ]
}

/**
 * dedupeKey = SHA-256(fields) + ':' + n, where n counts genuinely identical
 * rows within this one file (two 2,50 € at the same bakery on the same day →
 * :0 and :1). Identical rows always share a booking day and exports cut at
 * whole days, so an overlapping export reproduces the same keys.
 */
export async function computeDedupeKeys(statement: ParsedBankStatement, accountHash: string): Promise<KeyedBankRow[]> {
  const seen = new Map<string, number>()
  const keyed: KeyedBankRow[] = []
  for (const row of statement.rows) {
    const base = await sha256Hex(JSON.stringify(keyFields(row, statement.format, accountHash)))
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    keyed.push({ ...row, dedupeKey: `${base}:${n}` })
  }
  return keyed
}

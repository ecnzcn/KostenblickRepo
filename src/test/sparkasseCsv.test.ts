// Node environment: reads the Windows-1252 fixtures as raw bytes and uses
// Node's TextDecoder/Web Crypto, independent of jsdom's polyfills.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Account } from '../domain/models/entities'
import type { ParsedBankStatement } from '../domain/models/bankImport'
import { findMatchingAccount, hashAccountIdentifier, last4 } from '../domain/usecases/bankImport/accountIdentity'
import { parseCsv } from '../domain/usecases/bankImport/csv'
import { decodeBankFile } from '../domain/usecases/bankImport/decodeBankFile'
import { computeDedupeKeys } from '../domain/usecases/bankImport/dedupeKey'
import {
  UNKNOWN_FORMAT_ERROR,
  parseBankAmount,
  parseBankDate,
  parseExchangeRate,
  parseSparkasseCsv,
} from '../domain/usecases/bankImport/parseSparkasseCsv'
import { planImport } from '../domain/usecases/bankImport/planImport'

function fixtureBytes(name: string): Uint8Array {
  return readFileSync(new URL(`./fixtures/sparkasse/${name}`, import.meta.url))
}

function fixtureText(name: string): string {
  return decodeBankFile(fixtureBytes(name))
}

function parseOk(text: string): ParsedBankStatement {
  const result = parseSparkasseCsv(text)
  if (!result.ok) throw new Error(result.error)
  return result.statement
}

async function importAll(text: string, existing = new Set<string>()) {
  const statement = parseOk(text)
  const keyed = await computeDedupeKeys(statement, 'account-hash')
  return { statement, keyed, plan: planImport(existing, keyed, statement.pendingCount) }
}

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, delimiters and line breaks inside fields', () => {
    const records = parseCsv('"a";"b;c";"say ""hi"""\n"x";"line1\nline2";""\n')
    expect(records).toEqual([
      { line: 1, fields: ['a', 'b;c', 'say "hi"'] },
      { line: 2, fields: ['x', 'line1\nline2', ''] },
    ])
  })

  it('treats CRLF like LF and skips empty lines', () => {
    expect(parseCsv('a;b\r\n\r\nc;d\r\n').map((record) => record.fields)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })
})

describe('decodeBankFile', () => {
  it('reads Windows-1252 bytes (the Sparkasse export)', () => {
    expect(decodeBankFile(Uint8Array.from([0x4d, 0xfc, 0x6c, 0x6c]))).toBe('Müll')
  })

  it('reads a file that was saved again as UTF-8, with or without BOM', () => {
    const utf8 = new TextEncoder().encode('Müll')
    expect(decodeBankFile(utf8)).toBe('Müll')
    expect(decodeBankFile(Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))).toBe('Müll')
  })
})

describe('value parsing', () => {
  it('parses TT.MM.JJ dates and rejects impossible ones', () => {
    expect(parseBankDate('28.02.26')).toBe('2026-02-28')
    expect(parseBankDate('09.12.2024')).toBe('2024-12-09')
    expect(parseBankDate('31.02.26')).toBeUndefined()
    expect(parseBankDate('2026-02-28')).toBeUndefined()
  })

  it('parses German amounts strictly', () => {
    expect(parseBankAmount('-1234,56')).toBe(-1234.56)
    expect(parseBankAmount('1.234,56')).toBe(1234.56)
    expect(parseBankAmount('2232,77')).toBe(2232.77)
    expect(parseBankAmount('12')).toBeUndefined()
    expect(parseBankAmount('1.234')).toBeUndefined()
    expect(parseBankAmount('1,2')).toBeUndefined()
  })

  it('keeps every decimal of an exchange rate', () => {
    expect(parseExchangeRate('0,9357')).toBe(0.9357)
    expect(parseExchangeRate('abc')).toBeUndefined()
  })
})

describe('sparkasse-giro-camt-v2-sample.csv', () => {
  it('parses all 117 bookings with all 18 bank categories', async () => {
    const { statement, plan } = await importAll(fixtureText('sparkasse-giro-camt-v2-sample.csv'))
    expect(statement.format).toBe('sparkasse_giro')
    expect(statement.accountIdentifier).toBe('DE00000000000000000001')
    expect(statement.rows).toHaveLength(117)
    expect(statement.errors).toEqual([])
    expect(new Set(statement.rows.map((row) => row.bankCategory)).size).toBe(18)
    expect(new Set(statement.rows.map((row) => row.bookingText)).size).toBe(28)
    expect(plan.counts).toEqual({ total: 117, new: 117, duplicates: 0, skippedPending: 0 })
    expect([plan.periodFrom, plan.periodTo]).toEqual(['2024-12-09', '2026-09-22'])
  })

  it('keeps the two identical cash withdrawals on 15.05.26 as two bookings (:0 / :1)', async () => {
    const { keyed } = await importAll(fixtureText('sparkasse-giro-camt-v2-sample.csv'))
    const pair = keyed.filter((row) => row.bookingDate === '2026-05-15' && row.amount === -62.38)
    expect(pair).toHaveLength(2)
    expect(pair.map((row) => row.dedupeKey.split(':')[1])).toEqual(['0', '1'])
    expect(pair[0]?.dedupeKey.split(':')[0]).toBe(pair[1]?.dedupeKey.split(':')[0])
    expect(new Set(keyed.map((row) => row.dedupeKey)).size).toBe(117)
  })

  it('imports nothing new the second time', async () => {
    const text = fixtureText('sparkasse-giro-camt-v2-sample.csv')
    const first = await importAll(text)
    const second = await importAll(text, new Set(first.keyed.map((row) => row.dedupeKey)))
    expect(second.plan.counts).toMatchObject({ new: 0, duplicates: 117 })
  })

  it('handles overlapping monthly exports without duplicates', async () => {
    const [header, ...lines] = fixtureText('sparkasse-giro-camt-v2-sample.csv').trimEnd().split('\n')
    const exportA = [header, ...lines.slice(0, 80)].join('\n')
    const exportB = [header, ...lines.slice(50)].join('\n')

    const a = await importAll(exportA)
    const stored = new Set(a.keyed.map((row) => row.dedupeKey))
    const b = await importAll(exportB, stored)
    expect(b.plan.counts).toMatchObject({ new: 37, duplicates: 30 })

    const full = await importAll(fixtureText('sparkasse-giro-camt-v2-sample.csv'))
    const union = new Set([...stored, ...b.plan.newRows.map((row) => row.dedupeKey)])
    expect(union).toEqual(new Set(full.keyed.map((row) => row.dedupeKey)))
  })
})

describe('sparkasse-giro-edgecases.csv', () => {
  it('covers every special case from the fixture README', async () => {
    const { statement, plan, keyed } = await importAll(fixtureText('sparkasse-giro-edgecases.csv'))
    expect(statement.rows).toHaveLength(7)
    expect(statement.pendingCount).toBe(1)
    expect(plan.counts).toEqual({ total: 8, new: 7, duplicates: 0, skippedPending: 1 })

    const rent = statement.rows.find((row) => row.amount === -750)
    expect(rent?.purpose).toBe('Miete Oktober; Whg. 3\nMusterstraße 1')
    expect(rent?.counterpartyName).toBe('Vermieter Müller-Größe')

    const refund = statement.rows.find((row) => row.amount === 1234.56)
    expect(refund?.purpose).toBe('Rückerstattung Übernachtung "Hotel Ä"')

    const bakery = keyed.filter((row) => row.counterpartyName === 'Bäckerei Muster')
    expect(bakery.map((row) => row.dedupeKey.endsWith(':0') || row.dedupeKey.endsWith(':1'))).toEqual([true, true])
    expect(new Set(bakery.map((row) => row.dedupeKey)).size).toBe(2)

    expect(statement.rows.find((row) => row.bookingText === 'LS WIEDERGUTSCHRIFT')?.amount).toBe(36.43)
    expect(statement.rows.find((row) => row.bookingText === 'UEBERTRAG (UEBERWEISUNG)')?.bankCategory).toBe('Geldanlage')
    const fee = statement.rows.find((row) => row.bookingText === 'ENTGELTABSCHLUSS')
    expect(fee?.counterpartyName).toBe('')
    expect(fee?.counterpartyIban).toBeUndefined()
  })

  it('gives the same result for a UTF-8 re-saved and a CRLF copy', () => {
    const original = parseOk(fixtureText('sparkasse-giro-edgecases.csv'))
    const utf8Bytes = new TextEncoder().encode(fixtureText('sparkasse-giro-edgecases.csv'))
    const fromUtf8 = parseOk(decodeBankFile(utf8Bytes))
    const fromCrlf = parseOk(fixtureText('sparkasse-giro-edgecases.csv').replace(/\n/g, '\r\n'))

    expect(fromUtf8).toEqual(original)
    // CRLF only changes the line break inside the quoted rent purpose.
    expect(fromCrlf.rows.map((row) => row.amount)).toEqual(original.rows.map((row) => row.amount))
    expect(fromCrlf.rows.map((row) => row.purpose.replace(/\r\n/g, '\n'))).toEqual(original.rows.map((row) => row.purpose))
  })
})

describe('sparkasse-giro-ohne-optionale-spalten.csv', () => {
  it('parses by header name without "Glaeubiger ID" and "Kategorie"', () => {
    const statement = parseOk(fixtureText('sparkasse-giro-ohne-optionale-spalten.csv'))
    expect(statement.rows).toHaveLength(3)
    expect(statement.rows.every((row) => row.bankCategory === undefined && row.creditorId === undefined)).toBe(true)
    expect(statement.rows.map((row) => row.amount)).toEqual([-750, 1234.56, -2.5])
  })
})

describe('sparkasse-giro-fehlende-pflichtspalte.csv', () => {
  it('refuses the file with a clear message instead of importing part of it', () => {
    expect(parseSparkasseCsv(fixtureText('sparkasse-giro-fehlende-pflichtspalte.csv'))).toEqual({
      ok: false,
      error: 'In der Datei fehlt die Pflichtspalte „Betrag“. Es wurde nichts importiert.',
    })
  })
})

describe('sparkasse-kreditkarte-sample.csv', () => {
  it('detects the credit card format and parses all 66 rows', async () => {
    const { statement, keyed, plan } = await importAll(fixtureText('sparkasse-kreditkarte-sample.csv'))
    expect(statement.format).toBe('sparkasse_credit_card')
    expect(statement.accountIdentifier).toBe('0000 **** **** 0000')
    expect(statement.rows).toHaveLength(66)
    expect(statement.errors).toEqual([])
    expect(statement.rows.every((row) => row.purchaseDate)).toBe(true)
    expect(new Set(keyed.map((row) => row.dedupeKey)).size).toBe(66)
    expect(plan.counts.new).toBe(66)
  })

  it('keeps foreign currency details only where the export has a real currency', () => {
    const statement = parseOk(fixtureText('sparkasse-kreditkarte-sample.csv'))
    const chf = statement.rows.filter((row) => row.originalCurrency === 'CHF')
    expect(chf).toHaveLength(7)
    expect(chf[0]).toMatchObject({ amount: -11.49, originalAmount: -10.75, exchangeRate: 0.94 })
    const eur = statement.rows.filter((row) => !row.originalCurrency)
    expect(eur.every((row) => row.originalAmount === undefined && row.exchangeRate === undefined)).toBe(true)
  })

  it('marks settlements and currency conversion fees', () => {
    const statement = parseOk(fixtureText('sparkasse-kreditkarte-sample.csv'))
    const settlements = statement.rows.filter((row) => row.bookingText === 'LASTSCHRIFT')
    expect(settlements.map((row) => [row.bookingDate, row.amount])).toEqual([
      ['2026-09-14', 2232.77],
      ['2026-08-14', 1182.72],
    ])
    const fees = statement.rows.filter((row) => row.bookingText === 'GEBUEHR')
    expect(fees.map((row) => row.amount)).toEqual([-0.08, -0.49])
    expect(fees.every((row) => row.purpose === '1% für Währungsumrechnung' && row.counterpartyName)).toBe(true)
  })

  it('imports nothing new the second time', async () => {
    const text = fixtureText('sparkasse-kreditkarte-sample.csv')
    const first = await importAll(text)
    const second = await importAll(text, new Set(first.keyed.map((row) => row.dedupeKey)))
    expect(second.plan.counts).toMatchObject({ new: 0, duplicates: 66 })
  })
})

describe('invalid files', () => {
  const giroHeader =
    '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"Betrag";"Waehrung";"Info"'

  it('rejects an empty or foreign file', () => {
    expect(parseSparkasseCsv('')).toEqual({ ok: false, error: 'Die Datei ist leer.' })
    expect(parseSparkasseCsv('Datum,Betrag,Text\n2026-01-01,5,x')).toEqual({ ok: false, error: UNKNOWN_FORMAT_ERROR })
  })

  it('rejects a file with bookings of more than one account', () => {
    const text = [
      giroHeader,
      '"DE00000000000000000001";"01.09.26";"01.09.26";"KARTENZAHLUNG";"";"A";"";"-1,00";"EUR";"Umsatz gebucht"',
      '"DE00000000000000000002";"01.09.26";"01.09.26";"KARTENZAHLUNG";"";"B";"";"-2,00";"EUR";"Umsatz gebucht"',
    ].join('\n')
    expect(parseSparkasseCsv(text)).toMatchObject({ ok: false, error: expect.stringContaining('mehrerer Konten') })
  })

  it('reports a broken row by line and column, without its content', () => {
    const text = [
      giroHeader,
      '"DE00000000000000000001";"31.02.26";"01.09.26";"KARTENZAHLUNG";"geheim";"A";"";"-1,00";"EUR";"Umsatz gebucht"',
    ].join('\n')
    const statement = parseOk(text)
    expect(statement.rows).toEqual([])
    expect(statement.errors).toEqual([{ line: 2, message: 'Zeile 2: Spalte „Buchungstag“ enthält kein gültiges Datum.' }])
  })
})

describe('account identity', () => {
  it('matches an export to its account by salted hash, per account type', async () => {
    const identifier = 'DE00000000000000000001'
    const giro: Account = {
      id: 'giro',
      name: 'Giro',
      bank: 'sparkasse',
      type: 'giro',
      last4: last4(identifier),
      identifierSalt: 'salt-a',
      identifierHash: await hashAccountIdentifier(identifier, 'salt-a'),
      createdAt: '',
      updatedAt: '',
    }
    expect(giro.last4).toBe('0001')
    expect(await hashAccountIdentifier(identifier, 'salt-b')).not.toBe(giro.identifierHash)
    expect(await findMatchingAccount([giro], identifier, 'giro')).toBe(giro)
    expect(await findMatchingAccount([giro], identifier, 'credit_card')).toBeUndefined()
    expect(await findMatchingAccount([giro], 'DE00000000000000000002', 'giro')).toBeUndefined()
  })
})

describe('size', () => {
  it('handles a two-year export of 2,000+ rows', async () => {
    const [header, ...lines] = fixtureText('sparkasse-giro-camt-v2-sample.csv').trimEnd().split('\n')
    const text = [header, ...Array.from({ length: 20 }, () => lines).flat()].join('\n')
    const started = performance.now()
    const { statement, keyed } = await importAll(text)
    const elapsed = performance.now() - started

    expect(statement.rows).toHaveLength(2340)
    expect(new Set(keyed.map((row) => row.dedupeKey)).size).toBe(2340)
    expect(elapsed).toBeLessThan(5000)
  })
})

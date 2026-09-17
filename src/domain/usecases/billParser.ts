import type { Category } from '../models/entities'
import type { ParsedBill, ParsedBillItem, ParsedField } from '../models/ocr'
import { parseGermanAmount } from '../../utils/money'
import { normalizeOcrText } from './ocrNormalization'

/**
 * Turns raw OCR text into a ParsedBill. Pure and OCR-provider-agnostic: it
 * only ever sees the text a provider extracted, never a file or Blob, so it
 * works the same whether that text came from MockOCRService or a real
 * provider later. Every recognized value carries a confidence and (where
 * available) the source line it was read from - nothing here is ever
 * treated as final, that only happens once a human confirms it in the
 * review screen.
 *
 * Real bills vary a lot in layout, so this makes no assumption about a
 * fixed structure: it scans line by line for known German labels and
 * amounts rather than expecting fields at fixed positions.
 */

const AMOUNT_PATTERN = '(\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2}|\\d+)'
const AMOUNT_REGEX = new RegExp(AMOUNT_PATTERN)
// Item lines require a real decimal amount (cents included) - unlike the
// general AMOUNT_PATTERN above, this deliberately excludes the bare-integer
// alternative, since a stray number ("Seite 2 von 5") would otherwise be
// misread as a cost position. Only one separating space is required rather
// than two: real OCR output (Tesseract) reconstructs a line's words with
// single spaces, losing a printed document's original column alignment.
const ITEM_AMOUNT_PATTERN = '(\\d{1,3}(?:\\.\\d{3})+,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2})'
const ITEM_LINE_REGEX = new RegExp(`^(.{2,60}?)[\\s:]{1,}${ITEM_AMOUNT_PATTERN}\\s*€?\\s*$`)

const TOTAL_LABEL_PATTERNS = [
  /gesamtkosten\s*:?/i,
  /gesamtbetrag\s*:?/i,
  /gesamtsumme\s*:?/i,
  /\bgesamt\s*:?/i,
  /\bsumme\s*:?/i,
  // Excludes "...abrechnung" so a document title like "Betriebskostenabrechnung"
  // / "Nebenkostenabrechnung" is never mistaken for the total-amount label.
  /betriebskosten(?!abrechnung)\s*:?/i,
  /nebenkosten(?!abrechnung)\s*:?/i,
]

const ADVANCE_LABEL_PATTERNS = [/vorauszahlungen\s*:?/i, /vorauszahlung\s*:?/i]

const YEAR_LABEL_PATTERN = /abrechnungsjahr|abrechnungszeitraum/i
const RESERVED_LINE_PATTERN =
  /gesamtkosten|gesamtbetrag|gesamtsumme|^gesamt\b|^summe\b|betriebskosten|nebenkosten|vorauszahlung|nachzahlung|guthaben|abrechnungsjahr|abrechnungszeitraum/i

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  heating: ['heizung', 'heizkosten', 'heizöl', 'fernwärme'],
  water: ['wasser', 'abwasser', 'frischwasser', 'wasserversorgung'],
  waste: ['müll', 'muell', 'abfall'],
  caretaker: ['hausmeister', 'hauswart'],
  cleaning: ['reinigung'],
  property_tax: ['grundsteuer'],
  insurance: ['versicherung'],
  electricity: ['allgemeinstrom', 'strom'],
  internet: ['internet'],
  telecom: ['telekommunikation', 'telefon'],
}

interface LabeledMatch {
  value: number
  confidence: number
  sourceText: string
}

function findAmountForPattern(lines: string[], labelPattern: RegExp): LabeledMatch | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const labelMatch = labelPattern.exec(line)
    if (!labelMatch) continue

    const rest = line.slice(labelMatch.index + labelMatch[0].length)
    const sameLineAmount = AMOUNT_REGEX.exec(rest)
    if (sameLineAmount?.[1]) {
      const parsed = parseGermanAmount(sameLineAmount[1])
      if (parsed !== null) return { value: parsed, confidence: 0.95, sourceText: line.trim() }
    }

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = (lines[j] ?? '').trim()
      if (!nextLine) continue
      const nextAmount = AMOUNT_REGEX.exec(nextLine)
      if (nextAmount?.[1]) {
        const parsed = parseGermanAmount(nextAmount[1])
        if (parsed !== null) return { value: parsed, confidence: 0.8, sourceText: `${line.trim()} ${nextLine}` }
      }
      break
    }
  }
  return undefined
}

function findLabeledAmount(lines: string[], patterns: RegExp[]): LabeledMatch | undefined {
  for (const pattern of patterns) {
    const result = findAmountForPattern(lines, pattern)
    if (result) return result
  }
  return undefined
}

function findYear(lines: string[]): { value: number; confidence: number; sourceText: string } | undefined {
  for (const line of lines) {
    if (YEAR_LABEL_PATTERN.test(line)) {
      const yearMatch = /20\d{2}/.exec(line)
      if (yearMatch) return { value: Number(yearMatch[0]), confidence: 0.9, sourceText: line.trim() }
    }
  }
  for (const line of lines) {
    const yearMatch = /20\d{2}/.exec(line)
    if (yearMatch) return { value: Number(yearMatch[0]), confidence: 0.55, sourceText: line.trim() }
  }
  return undefined
}

function toIsoDate(day: string, month: string, year: string): string {
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString()
}

function findPeriod(
  lines: string[],
): { start: string; end: string; sourceText: string; confidence: number } | undefined {
  const periodRegex = /(\d{2})\.(\d{2})\.(\d{4})\s*(?:bis|-|–)\s*(\d{2})\.(\d{2})\.(\d{4})/
  for (const line of lines) {
    const match = periodRegex.exec(line)
    if (!match) continue
    const [, d1, m1, y1, d2, m2, y2] = match
    if (!d1 || !m1 || !y1 || !d2 || !m2 || !y2) continue
    return {
      start: toIsoDate(d1, m1, y1),
      end: toIsoDate(d2, m2, y2),
      sourceText: line.trim(),
      confidence: 0.85,
    }
  }
  return undefined
}

function matchCategory(description: string, categories: Category[]): { categoryId: string; confidence: number } {
  const normalized = description.toLowerCase()
  const availableIds = new Set(categories.map((category) => category.id))

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!availableIds.has(categoryId)) continue
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return { categoryId, confidence: 0.85 }
    }
  }

  const fallbackId = availableIds.has('other') ? 'other' : (categories[0]?.id ?? 'other')
  return { categoryId: fallbackId, confidence: 0.4 }
}

function findItems(lines: string[], categories: Category[]): ParsedBillItem[] {
  const items: ParsedBillItem[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || RESERVED_LINE_PATTERN.test(line)) continue

    const match = ITEM_LINE_REGEX.exec(line)
    if (!match?.[1] || !match[2]) continue

    const description = match[1].trim().replace(/[:-]+$/, '').trim()
    if (!description) continue

    const amount = parseGermanAmount(match[2])
    if (amount === null) continue

    const { categoryId, confidence } = matchCategory(description, categories)
    items.push({ categoryId, description, amount, confidence, sourceText: line })
  }
  return items
}

function toField<T>(match: { value: T; confidence: number; sourceText: string } | undefined): ParsedField<T | undefined> {
  if (!match) return { value: undefined, confidence: 0 }
  return { value: match.value, confidence: match.confidence, sourceText: match.sourceText }
}

export function parseBillText(rawText: string, categories: Category[]): ParsedBill {
  const normalizedText = normalizeOcrText(rawText)
  const lines = normalizedText.split('\n')

  const year = findYear(lines)
  const period = findPeriod(lines)
  const total = findLabeledAmount(lines, TOTAL_LABEL_PATTERNS)
  const advance = findLabeledAmount(lines, ADVANCE_LABEL_PATTERNS)
  const items = findItems(lines, categories)

  return {
    type: 'annual_statement',
    year: toField(year),
    periodStart: period
      ? { value: period.start, confidence: period.confidence, sourceText: period.sourceText }
      : { value: undefined, confidence: 0 },
    periodEnd: period
      ? { value: period.end, confidence: period.confidence, sourceText: period.sourceText }
      : { value: undefined, confidence: 0 },
    totalAmount: toField(total),
    advancePayments: toField(advance),
    items,
    rawText: normalizedText,
  }
}

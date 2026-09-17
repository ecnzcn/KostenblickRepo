import { describe, expect, it } from 'vitest'
import { DEFAULT_CATEGORIES } from '../../constants/categories'
import { parseBillText } from './billParser'

const categories = DEFAULT_CATEGORIES

describe('parseBillText', () => {
  it('extracts year, period, total, advance payments, and items from a well-formed bill', () => {
    const text = `Nebenkostenabrechnung
Abrechnungsjahr 2025
Abrechnungszeitraum: 01.01.2025 bis 31.12.2025

Heizkosten            850,00 €
Wasser                320,00 €
Müllabfuhr             180,00 €

Gesamtkosten: 1.350,00 €
Vorauszahlungen: 1.500,00 €`

    const result = parseBillText(text, categories)

    expect(result.year.value).toBe(2025)
    expect(result.year.confidence).toBeGreaterThan(0.8)
    expect(result.periodStart.value).toBe('2025-01-01T00:00:00.000Z')
    expect(result.periodEnd.value).toBe('2025-12-31T00:00:00.000Z')
    expect(result.totalAmount.value).toBe(1350)
    expect(result.advancePayments.value).toBe(1500)
    expect(result.items).toHaveLength(3)
  })

  it.each([
    ['1.234,56 €', 1234.56],
    ['1234,56 €', 1234.56],
    ['1234,56', 1234.56],
    ['1.234,56', 1234.56],
  ])('parses the German amount format %s after a "Gesamtkosten" label', (amountText, expected) => {
    const result = parseBillText(`Gesamtkosten: ${amountText}`, categories)
    expect(result.totalAmount.value).toBe(expected)
  })

  it.each(['Gesamtkosten', 'Gesamt', 'Summe', 'Betriebskosten', 'Nebenkosten'])(
    'recognizes the total via the "%s" label',
    (label) => {
      const result = parseBillText(`${label}: 900,00 €`, categories)
      expect(result.totalAmount.value).toBe(900)
    },
  )

  it.each(['Vorauszahlungen', 'Vorauszahlung'])('recognizes advance payments via the "%s" label', (label) => {
    const result = parseBillText(`${label}: 2.302,20 €`, categories)
    expect(result.advancePayments.value).toBe(2302.2)
  })

  it('falls back to the amount on the following line when not on the label line', () => {
    const text = `Gesamtkosten:
1.940,00 €`
    const result = parseBillText(text, categories)
    expect(result.totalAmount.value).toBe(1940)
    expect(result.totalAmount.confidence).toBeLessThan(0.95)
  })

  it.each([
    ['Heizkosten', 'heating'],
    ['Wasserversorgung', 'water'],
    ['Müllabfuhr', 'waste'],
    ['Hausmeisterservice', 'caretaker'],
    ['Gebäudereinigung', 'cleaning'],
    ['Grundsteuer', 'property_tax'],
    ['Gebäudeversicherung', 'insurance'],
  ])('maps the German label "%s" to category %s', (label, expectedCategoryId) => {
    const result = parseBillText(`${label}            100,00 €`, categories)
    expect(result.items[0]?.categoryId).toBe(expectedCategoryId)
    expect(result.items[0]?.confidence).toBeGreaterThan(0.7)
  })

  it('falls back to "other" with reduced confidence for an unrecognized item label', () => {
    const result = parseBillText('Sonstige Kosten            50,00 €', categories)
    expect(result.items[0]?.categoryId).toBe('other')
    expect(result.items[0]?.confidence).toBeLessThan(0.7)
  })

  it('does not misread reserved total/advance/balance lines as line items', () => {
    const text = `Gesamtkosten: 1.000,00 €
Vorauszahlungen: 1.100,00 €
Guthaben: 100,00 €
Heizkosten            1.000,00 €`
    const result = parseBillText(text, categories)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.description).toBe('Heizkosten')
  })

  it('returns undefined with zero confidence for fields that cannot be found', () => {
    const result = parseBillText('Ein Dokument ohne erkennbare Struktur.', categories)
    expect(result.year.value).toBeUndefined()
    expect(result.year.confidence).toBe(0)
    expect(result.totalAmount.value).toBeUndefined()
    expect(result.advancePayments.value).toBeUndefined()
    expect(result.items).toHaveLength(0)
  })

  it('never assumes a fixed layout - works when sections appear in a different order', () => {
    const text = `Vorauszahlungen: 500,00 €
Wasser                200,00 €
Gesamtkosten: 200,00 €
Abrechnungsjahr 2024`
    const result = parseBillText(text, categories)
    expect(result.year.value).toBe(2024)
    expect(result.totalAmount.value).toBe(200)
    expect(result.advancePayments.value).toBe(500)
    expect(result.items).toHaveLength(1)
  })

  // Phase 4.1: real OCR output is messier than a hand-written fixture -
  // ragged whitespace, stray line breaks, no guaranteed layout. These use
  // text shaped like genuine Tesseract output rather than a clean mock.
  describe('realistic OCR-shaped text', () => {
    it('parses Gesamtbetrag/Vorauszahlungen/Nachzahlung from a minimal OCR-style snippet', () => {
      const text = 'Gesamtbetrag: 1.284,53 €\nVorauszahlungen: 1.200,00 €\nNachzahlung: 84,53 €'
      const result = parseBillText(text, categories)
      expect(result.totalAmount.value).toBe(1284.53)
      expect(result.advancePayments.value).toBe(1200)
    })

    // Regression: a real Tesseract run on a rendered bill collapsed the
    // original multi-space column gap down to a single space, which caused
    // every cost position to go undetected (only labels/totals still
    // worked) until the item-line heuristic was loosened to accept one
    // space - as long as the amount includes decimal cents.
    it('detects cost positions separated by only a single space, as real OCR output produces', () => {
      const text = `Nebenkostenabrechnung
Abrechnungsjahr 2025
Abrechnungszeitraum: 01.01.2025 bis 31.12.2025
Heizkosten 620,12 €

Wasser 184,30 €

Muell 92,40 €

Hausmeister 85,00 €

Gesamtkosten: 981,82 €

Vorauszahlungen: 900,00 €`
      const result = parseBillText(text, categories)
      expect(result.totalAmount.value).toBe(981.82)
      expect(result.advancePayments.value).toBe(900)
      expect(result.items).toHaveLength(4)
      expect(result.items.map((item) => item.categoryId)).toEqual(['heating', 'water', 'waste', 'caretaker'])
      expect(result.items.map((item) => item.amount)).toEqual([620.12, 184.3, 92.4, 85])
    })

    it('does not misread a stray bare integer (e.g. a page/reference number) as a cost position', () => {
      const text = 'Seite 2 von 5\nRechnungsnummer 123456\nHeizung 100,00 €'
      const result = parseBillText(text, categories)
      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.description).toBe('Heizung')
    })

    it('tolerates ragged leading/trailing whitespace and stray blank lines from OCR', () => {
      const text = `  Nebenkostenabrechnung   \n\n\n\n  Abrechnungsjahr 2025  \n\n  Heizkosten            620,12 €  \n\n   Gesamtkosten: 1.284,53 €   `
      const result = parseBillText(text, categories)
      expect(result.year.value).toBe(2025)
      expect(result.totalAmount.value).toBe(1284.53)
      expect(result.items[0]?.categoryId).toBe('heating')
      expect(result.items[0]?.amount).toBe(620.12)
    })

    it('recognizes a Rechnungszeitraum given as two German dates', () => {
      const text = 'Abrechnungszeitraum: 01.01.2025 bis 31.12.2025\nGesamtkosten: 100,00 €'
      const result = parseBillText(text, categories)
      expect(result.periodStart.value).toBe('2025-01-01T00:00:00.000Z')
      expect(result.periodEnd.value).toBe('2025-12-31T00:00:00.000Z')
    })

    it('reads a full multi-position bill the way OCR would emit it (single blank-line separated blocks)', () => {
      const text = `Nebenkostenabrechnung
Abrechnungsjahr 2025
Abrechnungszeitraum: 01.01.2025 bis 31.12.2025

Heizung          620,12 €
Wasser           184,30 €
Müll              92,40 €
Hausmeister       85,00 €

Gesamtbetrag: 1.284,53 €
Vorauszahlungen: 1.200,00 €
Nachzahlung: 84,53 €`
      const result = parseBillText(text, categories)
      expect(result.year.value).toBe(2025)
      expect(result.totalAmount.value).toBe(1284.53)
      expect(result.advancePayments.value).toBe(1200)
      expect(result.items).toHaveLength(4)
      expect(result.items.map((item) => item.categoryId)).toEqual(['heating', 'water', 'waste', 'caretaker'])
    })
  })
})

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
})

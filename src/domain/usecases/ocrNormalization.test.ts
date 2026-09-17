import { describe, expect, it } from 'vitest'
import { normalizeOcrText } from './ocrNormalization'

describe('normalizeOcrText', () => {
  it('normalizes CRLF and lone CR line endings to LF', () => {
    expect(normalizeOcrText('Zeile 1\r\nZeile 2\rZeile 3')).toBe('Zeile 1\nZeile 2\nZeile 3')
  })

  it('trims leading and trailing whitespace on each line', () => {
    expect(normalizeOcrText('  Gesamtkosten: 100,00 €  \n   Vorauszahlungen: 90,00 €')).toBe(
      'Gesamtkosten: 100,00 €\nVorauszahlungen: 90,00 €',
    )
  })

  it('collapses runs of three or more blank lines to a single blank line', () => {
    expect(normalizeOcrText('Zeile 1\n\n\n\nZeile 2')).toBe('Zeile 1\n\nZeile 2')
  })

  it('turns form-feed/vertical-tab page-break artifacts into line breaks', () => {
    expect(normalizeOcrText('Seite 1\fSeite 2')).toBe('Seite 1\nSeite 2')
  })

  it('never touches digits, currency signs, or in-line spacing', () => {
    const line = 'Heizkosten            850,00 €'
    expect(normalizeOcrText(line)).toBe(line)
  })

  it('leaves already-clean text unchanged', () => {
    const text = 'Gesamtkosten: 1.284,53 €\nVorauszahlungen: 1.200,00 €'
    expect(normalizeOcrText(text)).toBe(text)
  })
})

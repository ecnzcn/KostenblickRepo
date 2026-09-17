import { describe, expect, it } from 'vitest'
import { hasUsableText, type PdfPageText } from './pdfDocument'

describe('hasUsableText', () => {
  it('is false for a document with no pages', () => {
    expect(hasUsableText([])).toBe(false)
  })

  it('is false when pages have no text (a scanned PDF)', () => {
    const pages: PdfPageText[] = [{ pageNumber: 1, text: '' }, { pageNumber: 2, text: '   ' }]
    expect(hasUsableText(pages)).toBe(false)
  })

  it('is false for only a handful of stray characters per page', () => {
    const pages: PdfPageText[] = [{ pageNumber: 1, text: 'X 3' }]
    expect(hasUsableText(pages)).toBe(false)
  })

  it('is true once pages contain a realistic amount of embedded text', () => {
    const pages: PdfPageText[] = [
      { pageNumber: 1, text: 'Nebenkostenabrechnung 2025 Gesamtkosten: 1.284,53 € Vorauszahlungen: 1.200,00 €' },
    ]
    expect(hasUsableText(pages)).toBe(true)
  })

  it('requires a usable amount of text on average across all pages, not just one', () => {
    const pages: PdfPageText[] = [
      { pageNumber: 1, text: 'Deckblatt' },
      { pageNumber: 2, text: '' },
    ]
    expect(hasUsableText(pages)).toBe(false)
  })
})

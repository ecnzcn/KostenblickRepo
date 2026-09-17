import './mapUpsertPolyfill'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** Below this many non-whitespace characters per page, a PDF's embedded
 * text layer is treated as unusable (e.g. missing, or just a handful of
 * stray glyphs) and the page is rendered + OCR'd instead of trusted. */
const MIN_USABLE_CHARS_PER_PAGE = 20

export interface PdfPageText {
  pageNumber: number
  text: string
}

async function loadPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const buffer = await blob.arrayBuffer()
  return pdfjsLib.getDocument({ data: buffer }).promise
}

/** Reads the embedded text layer of every page, in order. Does not render
 * anything - cheap, and the first thing to try before falling back to OCR. */
export async function extractPdfPageTexts(blob: Blob): Promise<PdfPageText[]> {
  const pdf = await loadPdf(blob)
  try {
    const pages: PdfPageText[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        // pdfjs's items are a flat run of text fragments, not lines - the
        // Bill Parser is line-based (it needs each cost position on its own
        // line to tell items apart), so line breaks are reconstructed from
        // `hasEOL` (pdfjs's own "this fragment ends a line" flag) rather
        // than joining everything into one giant line.
        let text = ''
        for (const item of content.items) {
          if (!('str' in item)) continue
          text += item.str
          text += item.hasEOL ? '\n' : ' '
        }
        pages.push({ pageNumber, text: text.trim() })
      } finally {
        page.cleanup()
      }
    }
    return pages
  } finally {
    await pdf.loadingTask.destroy()
  }
}

export function hasUsableText(pageTexts: PdfPageText[]): boolean {
  if (pageTexts.length === 0) return false
  const totalChars = pageTexts.reduce((sum, page) => sum + page.text.replace(/\s+/g, '').length, 0)
  return totalChars >= MIN_USABLE_CHARS_PER_PAGE * pageTexts.length
}

export interface RenderedPdfPage {
  pageNumber: number
  canvas: HTMLCanvasElement
}

/** Renders every page to an offscreen <canvas> for OCR, one at a time -
 * `onPage` lets the caller run OCR and drop the canvas immediately after,
 * rather than holding every page's bitmap in memory simultaneously (a real
 * concern for multi-page documents on a phone). */
export async function renderPdfPages(
  blob: Blob,
  onPage: (page: RenderedPdfPage) => Promise<void>,
  options: { scale?: number; signal?: AbortSignal } = {},
): Promise<number> {
  const { scale = 2, signal } = options
  const pdf = await loadPdf(blob)
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (signal?.aborted) break
      const page: PDFPageProxy = await pdf.getPage(pageNumber)
      try {
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvas, viewport }).promise
        await onPage({ pageNumber, canvas })
        canvas.width = 0
        canvas.height = 0
      } finally {
        page.cleanup()
      }
    }
    return pdf.numPages
  } finally {
    await pdf.loadingTask.destroy()
  }
}

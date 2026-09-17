import { categoryRepository } from '../../domain/repositories/categories'
import type { ParsedBill } from '../../domain/models/ocr'
import { parseBillText } from '../../domain/usecases/billParser'
import { OCRCancelledError } from './OCRCancelledError'
import type { OCRAnalysisResult, OCROptions, OCRProgress, OCRService, OCRTextResult } from './OCRService'
import { toFieldSummary } from './parsedBillFields'
import { extractPdfPageTexts, hasUsableText, renderPdfPages } from './pdf/pdfDocument'
import { recognizeImage, terminateOcrWorker } from './tesseract/tesseractWorker'

const PDF_MIME_TYPE = 'application/pdf'
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OCRCancelledError()
}

interface PageOcrResult {
  pageNumber: number
  text: string
  confidence: number
}

/**
 * Real, on-device OCR: no document byte ever leaves the browser. Decides
 * per file whether OCR is even necessary (a text-based PDF is read
 * directly), and for scanned PDFs/images runs Tesseract.js locally,
 * page by page, reporting genuinely measured progress and honoring
 * cancellation. See LocalOCRService's sibling `MockOCRService` for the
 * fixed-text dev/test stand-in this replaces as the app's active provider.
 */
export class LocalOCRService implements OCRService {
  async extractText(file: Blob, options: OCROptions = {}): Promise<OCRTextResult> {
    const { onProgress, signal } = options
    throwIfCancelled(signal)

    if (file.type === PDF_MIME_TYPE) {
      return this.extractFromPdf(file, onProgress, signal)
    }
    if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
      return this.extractFromImage(file, onProgress, signal)
    }
    throw new Error('Dieses Dateiformat wird nicht unterstützt.')
  }

  async analyzeDocument(file: Blob, options: OCROptions = {}): Promise<OCRAnalysisResult> {
    const { rawText, confidence } = await this.extractText(file, options)
    const categories = await categoryRepository.getAll()
    const parsed = parseBillText(rawText, categories)
    return { rawText, confidence, fields: toFieldSummary(parsed) }
  }

  async extractBillData(file: Blob, options: OCROptions = {}): Promise<ParsedBill> {
    const { rawText } = await this.extractText(file, options)
    throwIfCancelled(options.signal)
    options.onProgress?.({ stage: 'parsing', message: 'Kostenpositionen werden analysiert …' })
    const categories = await categoryRepository.getAll()
    return parseBillText(rawText, categories)
  }

  async dispose(): Promise<void> {
    await terminateOcrWorker()
  }

  private async extractFromPdf(
    file: Blob,
    onProgress: ((progress: OCRProgress) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<OCRTextResult> {
    onProgress?.({ stage: 'extracting', message: 'Dokument wird gelesen …' })
    const pageTexts = await extractPdfPageTexts(file)
    throwIfCancelled(signal)

    if (hasUsableText(pageTexts)) {
      onProgress?.({ stage: 'complete', message: 'Text aus dem PDF gelesen.' })
      return { rawText: joinPages(pageTexts), confidence: 0.97 }
    }

    // No usable embedded text -> this is a scanned PDF. Render and OCR each
    // page in order, one at a time (never all pages' canvases at once).
    const pageResults: PageOcrResult[] = []
    let total: number | undefined = pageTexts.length || undefined

    await renderPdfPages(
      file,
      async ({ pageNumber, canvas }) => {
        throwIfCancelled(signal)
        const pageLabel = `Seite ${pageNumber}${total ? ` von ${total}` : ''}`
        onProgress?.({ stage: 'rendering', current: pageNumber, total, message: `${pageLabel} wird vorbereitet …` })
        const result = await recognizeImage(canvas, (progress) => {
          onProgress?.({ ...progress, message: `${pageLabel} wird erkannt …` })
        })
        pageResults.push({ pageNumber, text: result.text, confidence: result.confidence })
      },
      { signal },
    ).then((pageCount) => {
      total = pageCount
    })
    throwIfCancelled(signal)

    const avgConfidence =
      pageResults.length > 0 ? pageResults.reduce((sum, page) => sum + page.confidence, 0) / pageResults.length : 0
    onProgress?.({ stage: 'complete', message: 'Text erkannt.' })
    return { rawText: joinPages(pageResults), confidence: avgConfidence }
  }

  private async extractFromImage(
    file: Blob,
    onProgress: ((progress: OCRProgress) => void) | undefined,
    signal: AbortSignal | undefined,
  ): Promise<OCRTextResult> {
    throwIfCancelled(signal)
    onProgress?.({ stage: 'recognizing', message: 'Text wird erkannt …' })
    const result = await recognizeImage(file, onProgress)
    throwIfCancelled(signal)
    onProgress?.({ stage: 'complete', message: 'Text erkannt.' })
    return { rawText: result.text, confidence: result.confidence }
  }
}

function joinPages(pages: { pageNumber: number; text: string }[]): string {
  return pages.map((page) => `--- Seite ${page.pageNumber} ---\n${page.text}`).join('\n\n')
}

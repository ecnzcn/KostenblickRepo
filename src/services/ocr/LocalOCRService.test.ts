import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDatabase } from '../../database/database'
import { OCRCancelledError } from './OCRCancelledError'
import { LocalOCRService } from './LocalOCRService'

// LocalOCRService's own job is orchestration: decide PDF-text-vs-OCR,
// drive pages in order, report progress, honor cancellation, clean up.
// Tesseract's WASM worker and pdfjs-dist's PDF worker cannot run
// meaningfully inside Vitest/jsdom, so those two boundaries are mocked here
// and exercised for real in a browser instead (see the Playwright
// verification referenced in the PR description).
const { extractPdfPageTexts, hasUsableText, renderPdfPages } = vi.hoisted(() => ({
  extractPdfPageTexts: vi.fn(),
  hasUsableText: vi.fn(),
  renderPdfPages: vi.fn(),
}))
vi.mock('./pdf/pdfDocument', () => ({ extractPdfPageTexts, hasUsableText, renderPdfPages }))

const { recognizeImage, terminateOcrWorker } = vi.hoisted(() => ({
  recognizeImage: vi.fn(),
  terminateOcrWorker: vi.fn(),
}))
vi.mock('./tesseract/tesseractWorker', () => ({ recognizeImage, terminateOcrWorker }))

beforeEach(async () => {
  await deleteDatabase()
  extractPdfPageTexts.mockReset()
  hasUsableText.mockReset()
  renderPdfPages.mockReset()
  recognizeImage.mockReset()
  terminateOcrWorker.mockReset().mockResolvedValue(undefined)
})

function imageFile(type: string): File {
  return new File([new Uint8Array(4)], `photo.${type.split('/')[1]}`, { type })
}

function pdfFile(): File {
  return new File(['%PDF-1.4'], 'bill.pdf', { type: 'application/pdf' })
}

describe('LocalOCRService.extractText', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('runs OCR directly on a %s image', async (mimeType) => {
    recognizeImage.mockResolvedValue({ text: 'Gesamtkosten: 100,00 €', confidence: 0.88 })
    const service = new LocalOCRService()

    const result = await service.extractText(imageFile(mimeType))

    expect(recognizeImage).toHaveBeenCalledTimes(1)
    expect(recognizeImage.mock.calls[0]?.[0]).toBeInstanceOf(File)
    expect(extractPdfPageTexts).not.toHaveBeenCalled()
    expect(result).toEqual({ rawText: 'Gesamtkosten: 100,00 €', confidence: 0.88 })
  })

  it('rejects an unsupported file format without touching OCR/PDF machinery', async () => {
    const service = new LocalOCRService()
    const unsupported = new File(['x'], 'note.txt', { type: 'text/plain' })

    await expect(service.extractText(unsupported)).rejects.toThrow(/nicht unterstützt/)
    expect(recognizeImage).not.toHaveBeenCalled()
    expect(extractPdfPageTexts).not.toHaveBeenCalled()
  })

  it('reads a text-based PDF directly, without rendering or running OCR', async () => {
    extractPdfPageTexts.mockResolvedValue([
      { pageNumber: 1, text: 'Gesamtkosten: 500,00 € Vorauszahlungen: 400,00 €' },
    ])
    hasUsableText.mockReturnValue(true)
    const service = new LocalOCRService()

    const result = await service.extractText(pdfFile())

    expect(renderPdfPages).not.toHaveBeenCalled()
    expect(recognizeImage).not.toHaveBeenCalled()
    expect(result.rawText).toContain('--- Seite 1 ---')
    expect(result.rawText).toContain('Gesamtkosten: 500,00 €')
    expect(result.confidence).toBeGreaterThan(0.9)
  })

  it('renders and OCRs a scanned PDF page by page, in order', async () => {
    extractPdfPageTexts.mockResolvedValue([
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '' },
    ])
    hasUsableText.mockReturnValue(false)
    recognizeImage
      .mockResolvedValueOnce({ text: 'Seite eins Inhalt', confidence: 0.8 })
      .mockResolvedValueOnce({ text: 'Seite zwei Inhalt', confidence: 0.6 })
    renderPdfPages.mockImplementation(async (_file, onPage) => {
      await onPage({ pageNumber: 1, canvas: {} })
      await onPage({ pageNumber: 2, canvas: {} })
      return 2
    })
    const service = new LocalOCRService()

    const result = await service.extractText(pdfFile())

    expect(recognizeImage).toHaveBeenCalledTimes(2)
    const firstIndex = result.rawText.indexOf('Seite eins Inhalt')
    const secondIndex = result.rawText.indexOf('Seite zwei Inhalt')
    expect(firstIndex).toBeGreaterThanOrEqual(0)
    expect(secondIndex).toBeGreaterThan(firstIndex)
    expect(result.rawText).toContain('--- Seite 1 ---')
    expect(result.rawText).toContain('--- Seite 2 ---')
    // Average of the two pages' confidences.
    expect(result.confidence).toBeCloseTo(0.7)
  })

  it('propagates a genuine failure (e.g. a corrupted file) instead of swallowing it', async () => {
    extractPdfPageTexts.mockRejectedValue(new Error('Invalid PDF structure'))
    const service = new LocalOCRService()

    await expect(service.extractText(pdfFile())).rejects.toThrow('Invalid PDF structure')
  })

  it('throws OCRCancelledError immediately when already aborted, before doing any work', async () => {
    const controller = new AbortController()
    controller.abort()
    const service = new LocalOCRService()

    await expect(service.extractText(imageFile('image/png'), { signal: controller.signal })).rejects.toBeInstanceOf(
      OCRCancelledError,
    )
    expect(recognizeImage).not.toHaveBeenCalled()
  })

  it('stops a scanned-PDF OCR run once cancelled between pages, without finishing all pages', async () => {
    extractPdfPageTexts.mockResolvedValue([{ pageNumber: 1, text: '' }, { pageNumber: 2, text: '' }])
    hasUsableText.mockReturnValue(false)
    const controller = new AbortController()
    recognizeImage.mockResolvedValueOnce({ text: 'Seite eins', confidence: 0.9 })
    renderPdfPages.mockImplementation(async (_file, onPage) => {
      await onPage({ pageNumber: 1, canvas: {} })
      controller.abort()
      // A real renderPdfPages checks the signal itself and stops early;
      // the mock simulates that by simply not invoking onPage again.
      return 2
    })
    const service = new LocalOCRService()

    await expect(service.extractText(pdfFile(), { signal: controller.signal })).rejects.toBeInstanceOf(
      OCRCancelledError,
    )
    expect(recognizeImage).toHaveBeenCalledTimes(1)
  })
})

describe('LocalOCRService progress reporting', () => {
  it('reports real stage/page information, never a fabricated percentage', async () => {
    recognizeImage.mockResolvedValue({ text: 'ok', confidence: 0.9 })
    const service = new LocalOCRService()
    const progressUpdates: string[] = []

    await service.extractText(imageFile('image/jpeg'), {
      onProgress: (progress) => progressUpdates.push(progress.stage),
    })

    expect(progressUpdates).toContain('recognizing')
    expect(progressUpdates).toContain('complete')
  })

  it('reports current/total page counts for a multi-page scanned PDF', async () => {
    extractPdfPageTexts.mockResolvedValue([{ pageNumber: 1, text: '' }, { pageNumber: 2, text: '' }])
    hasUsableText.mockReturnValue(false)
    recognizeImage.mockResolvedValue({ text: 'x', confidence: 0.9 })
    renderPdfPages.mockImplementation(async (_file, onPage) => {
      await onPage({ pageNumber: 1, canvas: {} })
      await onPage({ pageNumber: 2, canvas: {} })
      return 2
    })
    const service = new LocalOCRService()
    const pageProgress: Array<{ current?: number; total?: number }> = []

    await service.extractText(pdfFile(), {
      onProgress: (progress) => {
        if (progress.stage === 'rendering') pageProgress.push({ current: progress.current, total: progress.total })
      },
    })

    expect(pageProgress).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ])
  })
})

describe('LocalOCRService.dispose', () => {
  it('terminates the underlying OCR worker', async () => {
    const service = new LocalOCRService()
    await service.dispose()
    expect(terminateOcrWorker).toHaveBeenCalledTimes(1)
  })
})

describe('LocalOCRService.extractBillData', () => {
  it('feeds the recognized text through the existing Bill Parser', async () => {
    recognizeImage.mockResolvedValue({
      text: 'Gesamtkosten: 1.284,53 €\nVorauszahlungen: 1.200,00 €\nHeizung            620,12 €',
      confidence: 0.9,
    })
    const service = new LocalOCRService()

    const parsed = await service.extractBillData(imageFile('image/jpeg'))

    expect(parsed.totalAmount.value).toBe(1284.53)
    expect(parsed.advancePayments.value).toBe(1200)
    expect(parsed.items[0]?.categoryId).toBe('heating')
  })
})

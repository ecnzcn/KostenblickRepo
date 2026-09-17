import { createWorker, type Worker } from 'tesseract.js'
import type { OCRProgress } from '../OCRService'

// Vite resolves BASE_URL to '/' locally and to the GitHub Pages subpath
// ('/KostenblickRepo/') in production, so these stay correct in both.
const BASE = import.meta.env.BASE_URL

let workerPromise: Promise<Worker> | undefined
// The worker's `logger` is fixed at creation time and shared across every
// recognize() call, so the currently-interested caller is tracked here
// instead. Safe because recognize() calls never overlap - pages/images are
// always processed one at a time.
let activeProgressHandler: ((progress: OCRProgress) => void) | undefined

function mapLoggerMessage(msg: { status: string; progress: number }): OCRProgress {
  if (msg.status.includes('recognizing')) {
    return {
      stage: 'recognizing',
      // Tesseract's own measured recognition progress (0-1), shown as a
      // real 0-100 value - never a simulated/timer-based percentage.
      current: Math.round(msg.progress * 100),
      total: 100,
      message: 'Text wird erkannt …',
    }
  }
  return { stage: 'loading', message: 'OCR-Modul wird geladen …' }
}

/** A single, lazily-created, reused Tesseract worker (German, LSTM-only -
 * matches the vendored `4.0.0_best_int` trained data). All paths point at
 * the self-hosted copies under `public/vendor/tesseract` and
 * `public/tessdata` - never a third-party CDN - so OCR never triggers an
 * unexpected network request once those assets are cached. */
function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker('deu', 1, {
    workerPath: `${BASE}vendor/tesseract/worker.min.js`,
    corePath: `${BASE}vendor/tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${BASE}tessdata`,
    cacheMethod: 'none',
    logger: (msg) => activeProgressHandler?.(mapLoggerMessage(msg)),
  })
  return workerPromise
}

export interface RecognizeTextResult {
  text: string
  confidence: number
}

/** Runs OCR on a single image (a photo, or one rendered PDF page). */
export async function recognizeImage(
  image: Blob | HTMLCanvasElement,
  onProgress?: (progress: OCRProgress) => void,
): Promise<RecognizeTextResult> {
  const worker = await getWorker()
  activeProgressHandler = onProgress
  try {
    const { data } = await worker.recognize(image, {}, { text: true })
    return { text: data.text, confidence: data.confidence / 100 }
  } finally {
    activeProgressHandler = undefined
  }
}

/** Frees the worker (and its WASM instance). Safe to call even if no
 * worker was ever created. */
export async function terminateOcrWorker(): Promise<void> {
  const existing = workerPromise
  workerPromise = undefined
  const worker = await existing
  await worker?.terminate()
}

/** Thrown by an OCRService implementation when a caller-provided
 * AbortSignal fires mid-extraction, so callers can tell "the user cancelled
 * this" apart from a genuine OCR/parsing failure. */
export class OCRCancelledError extends Error {
  constructor() {
    super('OCR wurde abgebrochen.')
    this.name = 'OCRCancelledError'
  }
}

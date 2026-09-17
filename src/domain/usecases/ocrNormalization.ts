/**
 * Small, narrowly-scoped cleanup of raw OCR/PDF-extraction text before it
 * reaches the Bill Parser. It only fixes formatting noise that OCR
 * routinely introduces (mixed line endings, stray leading/trailing
 * whitespace per line, occasional page-break control characters, runs of
 * blank lines). It deliberately never touches digits, currency signs, or
 * the horizontal spacing *within* a line - that spacing is how the parser
 * tells a cost position's description apart from its amount, and financial
 * values must never be silently rewritten. When in doubt, the original
 * text wins.
 */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\f\v]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+$/, '').replace(/^[^\S\n]+/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

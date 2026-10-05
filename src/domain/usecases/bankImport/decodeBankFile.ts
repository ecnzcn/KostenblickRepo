/**
 * Sparkasse exports are Windows-1252. A file that was opened and saved again
 * in Numbers/Excel usually comes back as UTF-8 - accepted too: if the bytes
 * are valid UTF-8 they are read as such (Windows-1252 umlauts are never
 * valid UTF-8), otherwise as Windows-1252. The UTF-8 decoder drops a BOM.
 */
export function decodeBankFile(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view)
  } catch {
    return new TextDecoder('windows-1252').decode(view)
  }
}

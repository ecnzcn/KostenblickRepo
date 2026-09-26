/** Chunk size for `String.fromCharCode(...)` below - large typed arrays
 * passed as individual arguments can exceed the engine's call-stack limit
 * ("Maximum call stack size exceeded"), so bytes are converted in bounded
 * slices instead of all at once. */
const CHUNK_SIZE = 0x8000

/** Converts a Blob's raw bytes to a base64 string - used to embed document
 * bytes losslessly in JSON (e.g. a backup export). Uses `btoa`, available
 * in every target browser (including iOS Safari) and in Node - no extra
 * dependency needed. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }
  return btoa(binary)
}

/** Reverses blobToBase64 - reconstructs a Blob with the given MIME type
 * from a base64 string. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

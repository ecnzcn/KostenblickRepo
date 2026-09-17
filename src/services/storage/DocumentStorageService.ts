/**
 * Abstraction over where the raw bytes of an imported document live.
 * V1 stores everything locally in IndexedDB (see
 * IndexedDbDocumentStorageService); a future cloud-backed implementation
 * (e.g. uploading to a backend) can satisfy this same interface without any
 * caller (UI, use cases) changing. Never hold large file contents in React
 * state - components only ever see a `storageKey` and fetch the Blob on
 * demand when they actually need to render it.
 */
export interface DocumentStorageResult {
  storageKey: string
  filename: string
  mimeType: string
  size: number
}

export interface DocumentStorageService {
  save(file: File): Promise<DocumentStorageResult>
  get(storageKey: string): Promise<Blob | undefined>
  delete(storageKey: string): Promise<void>
}

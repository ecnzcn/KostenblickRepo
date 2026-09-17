export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024

export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const ACCEPTED_DOCUMENT_INPUT_ACCEPT = ACCEPTED_DOCUMENT_MIME_TYPES.join(',')

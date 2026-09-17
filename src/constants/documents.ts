import type { DocumentType, OCRStatus } from '../domain/models/entities'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  bill: 'Rechnung',
  contract: 'Vertrag',
  waste: 'Müll',
  other: 'Sonstige',
}

export const OCR_STATUS_LABELS: Record<OCRStatus, string> = {
  not_started: 'Kein OCR',
  pending: 'Ausstehend',
  processing: 'Wird verarbeitet',
  needs_review: 'Prüfung erforderlich',
  verified: 'Verifiziert',
  failed: 'Fehlgeschlagen',
}

/** Central thresholds for interpreting OCR/parser confidence scores (0..1).
 * Used by the review UI to decide how a recognized value is presented, and
 * kept here so every screen agrees on the same cutoffs. A value at or above
 * `high` is shown as reliably recognized; below `medium` the UI must nudge
 * the user toward manually checking it. */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
} as const

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return 'high'
  if (confidence >= CONFIDENCE_THRESHOLDS.medium) return 'medium'
  return 'low'
}

/** A manually confirmed value is always treated as maximally reliable -
 * this is the one place that decision is made, so no screen has to
 * reimplement "what confidence does a user edit get". */
export const MANUAL_VERIFICATION_CONFIDENCE = 1

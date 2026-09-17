import { getConfidenceLevel } from '../../../../constants/confidence'

interface ConfidenceBadgeProps {
  confidence: number
  manuallyVerified: boolean
}

/** Distinguishes "automatically recognized" from "manually confirmed"
 * values, and nudges toward review for anything below the medium
 * threshold - without red/alarming styling (per CLAUDE.md UX rules). */
export function ConfidenceBadge({ confidence, manuallyVerified }: ConfidenceBadgeProps) {
  if (manuallyVerified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ✓ Manuell bestätigt
      </span>
    )
  }

  const level = getConfidenceLevel(confidence)
  if (level === 'high') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
        Automatisch erkannt
      </span>
    )
  }
  if (level === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Bitte prüfen
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      ⚠ Prüfung empfohlen
    </span>
  )
}

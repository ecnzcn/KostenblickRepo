import { CONTRACT_UPCOMING_DAYS, CONTRACT_URGENT_DAYS } from '../../../constants/contracts'
import { daysUntil } from '../../../utils/date'
import type { Contract } from '../../models/entities'

export type ContractStatus = 'active' | 'upcoming' | 'urgent' | 'expired'

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: 'Aktiv',
  upcoming: 'Bald fällig',
  urgent: 'Dringend',
  expired: 'Abgelaufen',
}

/**
 * Status of a contract's cancellation deadline, derived purely from
 * `calculatedCancellationDate` and the current date - never duplicated in
 * a React component (see CONTRACT_URGENT_DAYS/CONTRACT_UPCOMING_DAYS for
 * the single source of truth on the day boundaries).
 *
 * - expired: the deadline has already passed (< 0 days remaining)
 * - urgent: 0-30 days remaining
 * - upcoming: 31-90 days remaining
 * - active: more than 90 days remaining, or no cancellation deadline is
 *   known at all (nothing pending to act on)
 */
export function getContractStatus(contract: Contract, referenceDate: Date = new Date()): ContractStatus {
  if (!contract.calculatedCancellationDate) return 'active'

  const days = daysUntil(contract.calculatedCancellationDate, referenceDate)
  if (days < 0) return 'expired'
  if (days <= CONTRACT_URGENT_DAYS) return 'urgent'
  if (days <= CONTRACT_UPCOMING_DAYS) return 'upcoming'
  return 'active'
}

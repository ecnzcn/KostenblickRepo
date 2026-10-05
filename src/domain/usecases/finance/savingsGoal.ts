import type { SavingsGoal } from '../../models/entities'
import { savingsGoalRepository } from '../../repositories/financeRepositories'
import { roundToCents } from '../../../utils/money'
import type { FlowTotals } from './monthlyOverview'

/**
 * Phase 14H: one monthly savings goal (E5, decision 6: set in the app,
 * stored in IndexedDB so it is part of the backup; local only like all
 * finance data).
 *
 * Progress (O-5) = (Saldo + Gespart) / Ziel, with Saldo = Einnahmen −
 * Ausgaben − Gespart - i.e. what this month left over in total. Shown as
 * 0-100 %; a negative value (more spent than earned) means 0 % and is
 * named as such.
 */

/** The single goal's fixed id - there is only ever one monthly goal. */
export const SAVINGS_GOAL_ID = 'monthly'
export const MAX_SAVINGS_TARGET = 1_000_000

export function validateSavingsTarget(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return 'Bitte gib einen Betrag ein, z. B. 500 oder 450,50.'
  if (value <= 0) return 'Das Sparziel muss größer als 0 € sein.'
  if (value > MAX_SAVINGS_TARGET) return 'Das Sparziel ist unplausibel hoch.'
  return null
}

export async function getSavingsGoal(): Promise<SavingsGoal | undefined> {
  return savingsGoalRepository.getById(SAVINGS_GOAL_ID)
}

export async function saveSavingsGoal(monthlyTarget: number | null, now: Date = new Date()): Promise<SavingsGoal> {
  const error = validateSavingsTarget(monthlyTarget)
  if (error) throw new Error(error)
  const existing = await getSavingsGoal()
  const nowIso = now.toISOString()
  const goal: SavingsGoal = {
    id: SAVINGS_GOAL_ID,
    monthlyTarget: roundToCents(monthlyTarget as number),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  }
  await savingsGoalRepository.save(goal)
  return goal
}

export async function removeSavingsGoal(): Promise<void> {
  await savingsGoalRepository.delete(SAVINGS_GOAL_ID)
}

export interface SavingsProgress {
  target: number
  /** Saldo + Gespart = Einnahmen − Ausgaben; may be negative. */
  achieved: number
  /** 0-1, clamped. */
  ratio: number
  /** Rounded down, so 99,6 % never reads as "100 % erreicht". */
  percent: number
  reached: boolean
  /** More spent than earned this month. */
  negative: boolean
}

export function calculateSavingsProgress(totals: FlowTotals, target: number): SavingsProgress {
  const achieved = roundToCents(totals.balance + totals.saved)
  const ratio = target > 0 ? Math.min(1, Math.max(0, achieved / target)) : 0
  return {
    target,
    achieved,
    ratio,
    percent: Math.floor(ratio * 100),
    reached: target > 0 && achieved >= target,
    negative: achieved < 0,
  }
}

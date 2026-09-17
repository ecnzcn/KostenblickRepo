import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import { roundToCents } from '../../utils/money'
import type { CancellationUnit, Contract } from '../models/entities'
import { contractRepository } from '../repositories/indexedDbRepositories'
import { calculateCancellationDate } from './cancellationDate'
import { generateContractReminders, removeContractReminders } from './reminders/generateContractReminders'
import { getEnabledReminderOffsets } from './reminders/reminderSettings'
import { validateContract } from './validation'

export interface ContractInput {
  categoryId: string
  provider: string
  tariff?: string
  contractNumber?: string
  monthlyCost: number
  yearlyCost?: number
  startDate: string
  endDate?: string
  cancellationPeriodValue?: number
  cancellationPeriodUnit?: CancellationUnit
  autoRenewal: boolean
  reminderEnabled: boolean
  notes?: string
}

function buildCandidate(id: string, input: ContractInput, existing?: Contract): Contract {
  const now = new Date().toISOString()
  const calculatedCancellationDate =
    input.endDate && input.cancellationPeriodValue !== undefined && input.cancellationPeriodUnit
      ? calculateCancellationDate(input.endDate, input.cancellationPeriodValue, input.cancellationPeriodUnit)
      : undefined

  return {
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    syncVersion: existing?.syncVersion ?? 1,
    userId: existing?.userId ?? DEFAULT_USER_ID,
    categoryId: input.categoryId,
    provider: input.provider,
    tariff: input.tariff,
    contractNumber: input.contractNumber,
    monthlyCost: input.monthlyCost,
    yearlyCost: input.yearlyCost ?? roundToCents(input.monthlyCost * 12),
    startDate: input.startDate,
    endDate: input.endDate,
    cancellationPeriodValue: input.cancellationPeriodValue,
    cancellationPeriodUnit: input.cancellationPeriodUnit,
    calculatedCancellationDate,
    autoRenewal: input.autoRenewal,
    reminderEnabled: input.reminderEnabled,
    notes: input.notes,
  }
}

/** Central validation for the raw form input, delegating the shared
 * field-level rules to validateContract() so there is a single place that
 * defines what a valid contract is. */
export function validateContractInput(input: ContractInput): string[] {
  return validateContract(buildCandidate('draft', input))
}

export async function createContract(input: ContractInput): Promise<Contract> {
  const errors = validateContractInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))
  const saved = await contractRepository.save(buildCandidate(generateId(), input))
  await generateContractReminders(saved, getEnabledReminderOffsets())
  return saved
}

export async function updateContract(id: string, input: ContractInput): Promise<Contract> {
  const errors = validateContractInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await contractRepository.getById(id)
  if (!existing) throw new Error('Vertrag wurde nicht gefunden.')

  const saved = await contractRepository.save(buildCandidate(id, input, existing))
  // Reconciles (not replaces) the contract's reminders against its
  // possibly-changed cancellation date - see generateContractReminders for
  // why this is safe to call on every update without creating duplicates.
  await generateContractReminders(saved, getEnabledReminderOffsets())
  return saved
}

export async function deleteContract(id: string): Promise<void> {
  await contractRepository.delete(id)
  await removeContractReminders(id)
}

export async function getContract(id: string): Promise<Contract | undefined> {
  return contractRepository.getById(id)
}

export async function listContracts(): Promise<Contract[]> {
  return contractRepository.getAll()
}

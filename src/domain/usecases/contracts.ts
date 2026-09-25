import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import { roundToCents } from '../../utils/money'
import type { CancellationUnit, Contract } from '../models/entities'
import { contractRepository } from '../repositories/indexedDbRepositories'
import { calculateCancellationDate } from './cancellationDate'
import { deleteDocumentIfUnreferenced, getDocument } from './documents'
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
    // ContractInput has no documentId field - a contract's document is
    // attached/removed separately (see setContractDocument /
    // removeContractDocument), so a plain create/update must never wipe an
    // already-attached document out from under it.
    documentId: existing?.documentId,
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
  const existing = await contractRepository.getById(id)
  await contractRepository.delete(id)
  await removeContractReminders(id)
  // Deleted after the contract itself, so the reference check below no
  // longer sees this contract as still holding the document.
  await deleteDocumentIfUnreferenced(existing?.documentId)
}

export async function getContract(id: string): Promise<Contract | undefined> {
  return contractRepository.getById(id)
}

export async function listContracts(): Promise<Contract[]> {
  return contractRepository.getAll()
}

export interface RunningContractCosts {
  /** Sum of monthlyCost across all currently active contracts. */
  monthly: number
  /** Sum of yearlyCost (or monthlyCost * 12 where yearlyCost is not set)
   * across all currently active contracts. */
  yearly: number
}

/** A contract counts as "currently active" (has an ongoing monthly/yearly
 * cost right now) when it has already started and, if it has an end date
 * at all, hasn't ended yet - date-only comparison against `referenceDate`,
 * ignoring time-of-day/timezone the same way getUpcomingContractDeadlines
 * does. A future contract (startDate in the future) is deliberately not
 * counted - its cost isn't running yet. */
export function isContractActive(contract: Contract, referenceDate: Date): boolean {
  const today = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  const start = new Date(contract.startDate).getTime()
  if (start > today) return false
  if (!contract.endDate) return true
  return new Date(contract.endDate).getTime() >= today
}

/**
 * Sums monthlyCost/yearlyCost across all currently active contracts -
 * these are contractual/planned figures, never actually-incurred costs
 * (see centralCosts.ts, "Contract is deliberately never read here"), so
 * this is intentionally kept separate from and never merged into the
 * actual-cost totals. Shared by the Dashboard and the Kostenübersicht so
 * both show the exact same "laufende Vertragskosten" figure instead of
 * two independently computed ones.
 */
export function calculateRunningContractCosts(contracts: Contract[], referenceDate: Date = new Date()): RunningContractCosts {
  const active = contracts.filter((contract) => isContractActive(contract, referenceDate))
  const monthly = roundToCents(active.reduce((sum, contract) => sum + contract.monthlyCost, 0))
  const yearly = roundToCents(
    active.reduce((sum, contract) => sum + (contract.yearlyCost ?? contract.monthlyCost * 12), 0),
  )
  return { monthly, yearly }
}

/** Re-reconciles every existing contract's cancellation reminders against
 * the currently enabled reminder intervals (Settings). Toggling an
 * interval on/off touches no individual contract, so without this the
 * already-generated reminders for a just-disabled interval would linger
 * until that contract happened to be created/edited again - reuses the
 * same idempotent generateContractReminders() reconciliation every
 * create/update already goes through, just applied to every contract. */
export async function reconcileAllContractReminders(): Promise<void> {
  const contracts = await listContracts()
  const offsets = getEnabledReminderOffsets()
  for (const contract of contracts) {
    await generateContractReminders(contract, offsets)
  }
}

/** Attaches an already-saved Document (see saveDocumentFile) to a
 * contract - kept separate from update Contract() since attaching a
 * document has nothing to do with the contract's own fields/validation and
 * must not trigger a reminder recalculation. Validates that both the
 * contract and the document actually exist before linking them, so this
 * can never point a contract at a dangling documentId. If the contract
 * already had a *different* document attached, that previous document is
 * reference-checked for cleanup afterwards (deleted only if nothing else
 * references it) - re-attaching never leaves an orphaned document behind,
 * and never deletes a document that's still needed elsewhere. */
export async function setContractDocument(id: string, documentId: string): Promise<Contract> {
  const existing = await contractRepository.getById(id)
  if (!existing) throw new Error('Vertrag wurde nicht gefunden.')
  const document = await getDocument(documentId)
  if (!document) throw new Error('Dokument wurde nicht gefunden.')

  const previousDocumentId = existing.documentId
  const updated = await contractRepository.save({ ...existing, documentId })

  if (previousDocumentId && previousDocumentId !== documentId) {
    await deleteDocumentIfUnreferenced(previousDocumentId)
  }
  return updated
}

/** Removes a contract's attached document (Vertragsdokument) and deletes
 * its bytes/metadata unless another entity still references it - the
 * contract itself is left untouched. */
export async function removeContractDocument(contract: Contract): Promise<Contract> {
  if (!contract.documentId) return contract
  const documentId = contract.documentId
  const updated = await contractRepository.save({ ...contract, documentId: undefined })
  await deleteDocumentIfUnreferenced(documentId)
  return updated
}

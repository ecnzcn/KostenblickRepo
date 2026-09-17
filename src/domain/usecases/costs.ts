import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import type { CostEntry } from '../models/entities'
import { costEntryRepository } from '../repositories/indexedDbRepositories'

export interface CostEntryInput {
  categoryId: string
  amount: number
  date: string
  period?: string
  notes?: string
}

export function validateCostEntryInput(input: CostEntryInput): string[] {
  const errors: string[] = []
  if (!input.categoryId) errors.push('Kategorie ist erforderlich.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) errors.push('Betrag muss größer als 0 sein.')
  if (!input.date) errors.push('Datum ist erforderlich.')
  return errors
}

export async function createCostEntry(input: CostEntryInput): Promise<CostEntry> {
  const errors = validateCostEntryInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const now = new Date().toISOString()
  const entry: CostEntry = {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    userId: DEFAULT_USER_ID,
    categoryId: input.categoryId,
    amount: input.amount,
    date: input.date,
    period: input.period,
    source: 'manual',
    notes: input.notes,
  }
  return costEntryRepository.save(entry)
}

export async function updateCostEntry(id: string, input: CostEntryInput): Promise<CostEntry> {
  const errors = validateCostEntryInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await costEntryRepository.getById(id)
  if (!existing) throw new Error('Kosteneintrag wurde nicht gefunden.')

  return costEntryRepository.save({
    ...existing,
    categoryId: input.categoryId,
    amount: input.amount,
    date: input.date,
    period: input.period,
    notes: input.notes,
  })
}

export async function deleteCostEntry(id: string): Promise<void> {
  await costEntryRepository.delete(id)
}

export async function getCostEntry(id: string): Promise<CostEntry | undefined> {
  return costEntryRepository.getById(id)
}

export async function listCostEntries(): Promise<CostEntry[]> {
  const entries = await costEntryRepository.getAll()
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

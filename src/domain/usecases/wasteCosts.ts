import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import { roundToCents } from '../../utils/money'
import type { WasteCategory, WasteCost } from '../models/entities'
import { wasteCostRepository } from '../repositories/indexedDbRepositories'
import { deleteDocumentIfUnreferenced } from './documents'
import { calculateYearOverYearChange } from './statistics/calculateYearComparison'

const MIN_YEAR = 2000
const MAX_YEAR = 2200

export interface WasteCostInput {
  year: number
  category: WasteCategory
  amount: number
  notes?: string
  /** Unlike ContractInput, this IS part of the plain create/update input -
   * WasteCost has no separate attach/detach step, so the document is just
   * another form field (see WasteCostFormPage). Explicitly `undefined`
   * means "no document" and is honored as such (not defaulted back to a
   * previous value) by updateWasteCost. */
  documentId?: string
}

export function validateWasteCostInput(input: WasteCostInput): string[] {
  const errors: string[] = []
  if (!Number.isInteger(input.year) || input.year < MIN_YEAR || input.year > MAX_YEAR) {
    errors.push('Jahr ist ungültig.')
  }
  if (!input.category) errors.push('Kategorie ist erforderlich.')
  if (!Number.isFinite(input.amount) || input.amount < 0) errors.push('Betrag muss eine nicht-negative Zahl sein.')
  return errors
}

export async function createWasteCost(input: WasteCostInput): Promise<WasteCost> {
  const errors = validateWasteCostInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const now = new Date().toISOString()
  const wasteCost: WasteCost = {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    userId: DEFAULT_USER_ID,
    year: input.year,
    category: input.category,
    amount: input.amount,
    notes: input.notes,
    documentId: input.documentId,
  }
  return wasteCostRepository.save(wasteCost)
}

export async function updateWasteCost(id: string, input: WasteCostInput): Promise<WasteCost> {
  const errors = validateWasteCostInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await wasteCostRepository.getById(id)
  if (!existing) throw new Error('Müllkosten-Eintrag wurde nicht gefunden.')

  const previousDocumentId = existing.documentId
  const updated = await wasteCostRepository.save({
    ...existing,
    year: input.year,
    category: input.category,
    amount: input.amount,
    notes: input.notes,
    documentId: input.documentId,
  })

  // The document is a plain form field here (see WasteCostInput above), so
  // a changed or removed documentId is resolved the same way Contract's
  // dedicated setContractDocument()/removeContractDocument() resolve it:
  // reference-checked delete of whatever was previously attached, never
  // touching a document another entity still needs.
  if (previousDocumentId && previousDocumentId !== input.documentId) {
    await deleteDocumentIfUnreferenced(previousDocumentId)
  }
  return updated
}

export async function deleteWasteCost(id: string): Promise<void> {
  const existing = await wasteCostRepository.getById(id)
  await wasteCostRepository.delete(id)
  // Deleted after the WasteCost itself, so the reference check below no
  // longer sees this entry as still holding the document.
  await deleteDocumentIfUnreferenced(existing?.documentId)
}

export async function getWasteCost(id: string): Promise<WasteCost | undefined> {
  return wasteCostRepository.getById(id)
}

export async function listWasteCosts(): Promise<WasteCost[]> {
  return wasteCostRepository.getAll()
}

export function listWasteCostsByYear(wasteCosts: WasteCost[], year: number): WasteCost[] {
  return wasteCosts.filter((entry) => entry.year === year)
}

/** Every year that has at least one entry, newest first - the basis for
 * the "‹ 2026 ›" year switcher on /muell. */
export function getWasteCostYears(wasteCosts: WasteCost[]): number[] {
  return [...new Set(wasteCosts.map((entry) => entry.year))].sort((a, b) => b - a)
}

export interface WasteCostCategoryTotal {
  category: WasteCategory
  amount: number
}

export interface WasteCostYearSummary {
  year: number
  total: number
  byCategory: WasteCostCategoryTotal[]
  /** undefined = no previous-year data to compare against. */
  previousYearTotal?: number
  change?: number
  /** undefined = no previous year; null = previous year total was 0 (no
   * valid percentage base). */
  changePercent?: number | null
}

/** Aggregates a year's total and per-category breakdown, plus the
 * year-over-year comparison against `year - 1` - reuses the same
 * calculateYearOverYearChange() the Statistics feature already uses, so
 * the 0-previous-year / no-previous-year handling isn't reimplemented. */
export function getWasteCostSummary(wasteCosts: WasteCost[], year: number): WasteCostYearSummary {
  const entriesForYear = listWasteCostsByYear(wasteCosts, year)
  const total = roundToCents(entriesForYear.reduce((sum, entry) => sum + entry.amount, 0))

  const totalsByCategory = new Map<WasteCategory, number>()
  for (const entry of entriesForYear) {
    totalsByCategory.set(entry.category, (totalsByCategory.get(entry.category) ?? 0) + entry.amount)
  }
  const byCategory = [...totalsByCategory.entries()]
    .map(([category, amount]) => ({ category, amount: roundToCents(amount) }))
    .sort((a, b) => b.amount - a.amount)

  const previousYearEntries = listWasteCostsByYear(wasteCosts, year - 1)
  const previousYearTotal =
    previousYearEntries.length > 0
      ? roundToCents(previousYearEntries.reduce((sum, entry) => sum + entry.amount, 0))
      : undefined
  const { change, percent } = calculateYearOverYearChange(total, previousYearTotal)

  return { year, total, byCategory, previousYearTotal, change, changePercent: percent }
}

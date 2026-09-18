import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import { roundToCents } from '../../utils/money'
import type { BalanceType, Bill, BillItem, BillType } from '../models/entities'
import { billItemRepository, billRepository } from '../repositories/indexedDbRepositories'
import { deleteDocumentIfUnreferenced } from './documents'
import { sumBillItems } from './validation'

export interface BillItemInput {
  /** Set only when this input represents an existing BillItem being
   * resubmitted (edit flow) - omitted for a newly added item. Must match an
   * item that currently belongs to the Bill being updated; an id that
   * doesn't (unknown/foreign/stale) is never treated as a reference to an
   * existing item - it is built exactly like a brand-new item instead, so a
   * stray id can never attach to or overwrite someone else's BillItem. */
  id?: string
  categoryId: string
  description: string
  amount: number
  /** Only set by the OCR import flow, or by resubmitting an existing item's
   * own values on edit; manual entry (the default) always saves items as
   * fully confirmed, matching prior behavior. */
  confidence?: number
  sourceText?: string
  manuallyVerified?: boolean
}

export interface BillInput {
  type: BillType
  year: number
  periodStart?: string
  periodEnd?: string
  advancePayments: number
  items: BillItemInput[]
  /** Set when this Bill was created via the OCR import workflow, linking it
   * to its original Document. */
  documentId?: string
  /** The confirmed total amount (e.g. an OCR-recognized value the user
   * reviewed and possibly corrected). When omitted - the manual-entry
   * default - totalAmount is derived from the sum of items, as before. A
   * document's printed total can legitimately differ from the sum of the
   * cost positions recognized from it (missed line items, rounding,
   * un-itemized fees); the review screen lets the user save despite that
   * discrepancy, so whatever they confirmed here is what gets persisted. */
  totalAmount?: number
  /** Edit-mode only: when the existing Bill has a confirmed totalAmount,
   * pass true to explicitly discard it and recompute totalAmount from the
   * submitted items instead. Ignored for create and for Bills without a
   * confirmed totalAmount, where the sum of items is always used already. */
  recalculateTotalAmount?: boolean
}

export interface BillWithItems {
  bill: Bill
  items: BillItem[]
}

export const BILL_TYPE_LABELS: Record<BillType, string> = {
  utility: 'Nebenkostenabrechnung',
  operating_cost: 'Betriebskostenabrechnung',
  annual_statement: 'Jahresabrechnung',
}

/** Nachzahlung (payment_due) when total > advance payments, Guthaben
 * (credit) when total < advance payments, otherwise none. Centralized so
 * the UI never re-derives this itself. */
export function calculateBillBalance(
  totalAmount: number,
  advancePayments: number,
): { balance: number; balanceType: BalanceType } {
  const diff = roundToCents(totalAmount - advancePayments)
  if (diff > 0) return { balance: diff, balanceType: 'payment_due' }
  if (diff < 0) return { balance: roundToCents(-diff), balanceType: 'credit' }
  return { balance: 0, balanceType: 'none' }
}

export function validateBillInput(input: BillInput): string[] {
  const errors: string[] = []
  if (!Number.isInteger(input.year)) errors.push('Jahr ist erforderlich.')
  if (!Number.isFinite(input.advancePayments) || input.advancePayments < 0) {
    errors.push('Vorauszahlungen dürfen nicht negativ sein.')
  }
  if (input.totalAmount !== undefined && (!Number.isFinite(input.totalAmount) || input.totalAmount < 0)) {
    errors.push('Gesamtsumme muss eine gültige, nicht-negative Zahl sein.')
  }
  for (const item of input.items) {
    if (!item.categoryId) errors.push('Jede Kostenposition benötigt eine Kategorie.')
    if (!Number.isFinite(item.amount) || item.amount < 0) {
      errors.push('Kostenpositionen dürfen nicht negativ sein.')
    }
  }
  return errors
}

/**
 * Builds the persisted BillItem set for a save. An input re-identified as an
 * existing item (via `id`, matched only against `existingItems` - never by
 * position, description, amount or category) keeps that item's `id` and
 * `createdAt`; its OCR provenance (`confidence`/`sourceText`/
 * `manuallyVerified`) is taken from the input when provided (the UI already
 * decides there whether a field was actually changed - see BillItemRow's
 * markEdited) and otherwise falls back to the existing item's own values, so
 * a caller that omits them never wipes them out. An input without a
 * recognized `id` is built exactly like the previous behavior: a fresh item
 * with the established manual-entry defaults (`confidence: 1`,
 * `manuallyVerified: true`, no sourceText).
 */
function buildItems(billId: string, items: BillItemInput[], existingItems: BillItem[], now: string): BillItem[] {
  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  return items.map((item) => {
    const existing = item.id !== undefined ? existingById.get(item.id) : undefined
    if (existing) {
      return {
        ...existing,
        updatedAt: now,
        categoryId: item.categoryId,
        description: item.description,
        amount: item.amount,
        confidence: item.confidence ?? existing.confidence,
        sourceText: item.sourceText ?? existing.sourceText,
        manuallyVerified: item.manuallyVerified ?? existing.manuallyVerified,
      }
    }
    return {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncVersion: 1,
      billId,
      categoryId: item.categoryId,
      description: item.description,
      amount: item.amount,
      confidence: item.confidence ?? 1,
      sourceText: item.sourceText,
      manuallyVerified: item.manuallyVerified ?? true,
    }
  })
}

/**
 * Saves a Bill together with its BillItems. The current IndexedDBRepository
 * abstraction (src/database/repository.ts) does not support a single
 * transaction spanning multiple object stores, so this performs the Bill
 * write first and the BillItem writes after it, sequentially. If a
 * BillItem write fails partway through, this rolls back (deletes) the Bill
 * and any items that did save, rather than leaving an orphaned, invisible
 * partial Bill behind for a retry to pile another one onto - not a true
 * atomic transaction, but self-healing on failure. Extending the
 * repository layer to accept an external multi-store transaction would be
 * a larger architectural change out of scope for this phase.
 */
export async function createBillWithItems(input: BillInput): Promise<BillWithItems> {
  const errors = validateBillInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const now = new Date().toISOString()
  const billId = generateId()
  const items = buildItems(billId, input.items, [], now)
  const totalAmountConfirmed = input.totalAmount !== undefined
  const totalAmount = input.totalAmount ?? sumBillItems(items)
  const { balance, balanceType } = calculateBillBalance(totalAmount, input.advancePayments)

  const bill: Bill = {
    id: billId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    userId: DEFAULT_USER_ID,
    type: input.type,
    year: input.year,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalAmount,
    totalAmountConfirmed,
    advancePayments: input.advancePayments,
    balance,
    balanceType,
    documentId: input.documentId,
  }

  const savedBill = await billRepository.save(bill)
  const savedItems: BillItem[] = []
  try {
    for (const item of items) {
      savedItems.push(await billItemRepository.save(item))
    }
  } catch (error) {
    for (const savedItem of savedItems) {
      await billItemRepository.delete(savedItem.id).catch(() => undefined)
    }
    await billRepository.delete(savedBill.id).catch(() => undefined)
    throw error
  }

  return { bill: savedBill, items: savedItems }
}

export async function updateBillWithItems(id: string, input: BillInput): Promise<BillWithItems> {
  const errors = validateBillInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await billRepository.getById(id)
  if (!existing) throw new Error('Abrechnung wurde nicht gefunden.')

  const now = new Date().toISOString()
  const existingItems = await listBillItems(id)
  const items = buildItems(id, input.items, existingItems, now)
  const itemSum = sumBillItems(items)

  // A confirmed totalAmount (from a reviewed import) is preserved on edit
  // unless the user explicitly asks to discard it - editing items never
  // silently recomputes it. The decision is the explicit
  // recalculateTotalAmount flag, never a heuristic comparison of the two
  // numbers (which would misfire whenever they happen to coincide).
  const keepConfirmedTotal = existing.totalAmountConfirmed === true && input.recalculateTotalAmount !== true
  const totalAmount = keepConfirmedTotal ? existing.totalAmount : itemSum
  const totalAmountConfirmed = keepConfirmedTotal
  const { balance, balanceType } = calculateBillBalance(totalAmount, input.advancePayments)

  const savedBill = await billRepository.save({
    ...existing,
    type: input.type,
    year: input.year,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalAmount,
    totalAmountConfirmed,
    advancePayments: input.advancePayments,
    balance,
    balanceType,
  })

  // Items re-identified by id in `items` (see buildItems) are updated in
  // place, preserving their id/createdAt/OCR provenance; anything from the
  // previous item set that no longer appears - because it was removed in
  // the form - is soft-deleted, same as before.
  const keptIds = new Set(items.map((item) => item.id))
  for (const item of existingItems) {
    if (!keptIds.has(item.id)) await billItemRepository.delete(item.id)
  }

  const savedItems: BillItem[] = []
  for (const item of items) {
    savedItems.push(await billItemRepository.save(item))
  }

  return { bill: savedBill, items: savedItems }
}

export async function deleteBillWithItems(id: string): Promise<void> {
  const existing = await billRepository.getById(id)
  const items = await listBillItems(id)
  for (const item of items) {
    await billItemRepository.delete(item.id)
  }
  await billRepository.delete(id)
  // Deleted after the bill itself, so the reference check below no longer
  // sees this bill as still holding the document.
  await deleteDocumentIfUnreferenced(existing?.documentId)
}

export async function getBill(id: string): Promise<Bill | undefined> {
  return billRepository.getById(id)
}

export async function listBillItems(billId: string): Promise<BillItem[]> {
  const all = await billItemRepository.getAll()
  return all.filter((item) => item.billId === billId)
}

/** Deletes the original document linked to a bill and clears the link -
 * the bill itself (and its items) are left untouched. */
export async function removeBillDocument(bill: Bill): Promise<Bill> {
  if (!bill.documentId) return bill
  const documentId = bill.documentId
  const updated = await billRepository.save({ ...bill, documentId: undefined })
  // The link is cleared first, so the reference check no longer sees this
  // bill as still holding the document.
  await deleteDocumentIfUnreferenced(documentId)
  return updated
}

export async function listBills(): Promise<Bill[]> {
  const bills = await billRepository.getAll()
  return bills.sort((a, b) => b.year - a.year || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

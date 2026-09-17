import { DEFAULT_USER_ID } from '../../constants/user'
import { generateId } from '../../utils/id'
import { roundToCents } from '../../utils/money'
import type { BalanceType, Bill, BillItem, BillType } from '../models/entities'
import { billItemRepository, billRepository } from '../repositories/indexedDbRepositories'
import { sumBillItems } from './validation'

export interface BillItemInput {
  categoryId: string
  description: string
  amount: number
}

export interface BillInput {
  type: BillType
  year: number
  periodStart?: string
  periodEnd?: string
  advancePayments: number
  items: BillItemInput[]
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
  for (const item of input.items) {
    if (!item.categoryId) errors.push('Jede Kostenposition benötigt eine Kategorie.')
    if (!Number.isFinite(item.amount) || item.amount < 0) {
      errors.push('Kostenpositionen dürfen nicht negativ sein.')
    }
  }
  return errors
}

function buildItems(billId: string, items: BillItemInput[], now: string): BillItem[] {
  return items.map((item) => ({
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    billId,
    categoryId: item.categoryId,
    description: item.description,
    amount: item.amount,
    confidence: 1,
    manuallyVerified: true,
  }))
}

/**
 * Saves a Bill together with its BillItems. The current IndexedDBRepository
 * abstraction (src/database/repository.ts) does not support a single
 * transaction spanning multiple object stores, so this performs the Bill
 * write first and the BillItem writes after it, sequentially. If a
 * BillItem write fails partway through, the Bill and any already-saved
 * items remain persisted (no automatic rollback) - this is a known,
 * documented limitation rather than a true atomic operation. Extending the
 * repository layer to accept an external multi-store transaction would be
 * a larger architectural change out of scope for this phase.
 */
export async function createBillWithItems(input: BillInput): Promise<BillWithItems> {
  const errors = validateBillInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const now = new Date().toISOString()
  const billId = generateId()
  const items = buildItems(billId, input.items, now)
  const totalAmount = sumBillItems(items)
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
    advancePayments: input.advancePayments,
    balance,
    balanceType,
    ocrStatus: 'not_started',
  }

  const savedBill = await billRepository.save(bill)
  const savedItems: BillItem[] = []
  for (const item of items) {
    savedItems.push(await billItemRepository.save(item))
  }

  return { bill: savedBill, items: savedItems }
}

export async function updateBillWithItems(id: string, input: BillInput): Promise<BillWithItems> {
  const errors = validateBillInput(input)
  if (errors.length > 0) throw new Error(errors.join(' '))

  const existing = await billRepository.getById(id)
  if (!existing) throw new Error('Abrechnung wurde nicht gefunden.')

  const now = new Date().toISOString()
  const items = buildItems(id, input.items, now)
  const totalAmount = sumBillItems(items)
  const { balance, balanceType } = calculateBillBalance(totalAmount, input.advancePayments)

  const savedBill = await billRepository.save({
    ...existing,
    type: input.type,
    year: input.year,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalAmount,
    advancePayments: input.advancePayments,
    balance,
    balanceType,
  })

  // Editing a bill replaces its full item set: soft-delete the previous
  // items (preserving them for the sync queue) and create fresh ones from
  // the submitted form rather than diffing individual rows.
  const existingItems = await listBillItems(id)
  for (const item of existingItems) {
    await billItemRepository.delete(item.id)
  }

  const savedItems: BillItem[] = []
  for (const item of items) {
    savedItems.push(await billItemRepository.save(item))
  }

  return { bill: savedBill, items: savedItems }
}

export async function deleteBillWithItems(id: string): Promise<void> {
  const items = await listBillItems(id)
  for (const item of items) {
    await billItemRepository.delete(item.id)
  }
  await billRepository.delete(id)
}

export async function getBill(id: string): Promise<Bill | undefined> {
  return billRepository.getById(id)
}

export async function listBillItems(billId: string): Promise<BillItem[]> {
  const all = await billItemRepository.getAll()
  return all.filter((item) => item.billId === billId)
}

export async function listBills(): Promise<Bill[]> {
  const bills = await billRepository.getAll()
  return bills.sort((a, b) => b.year - a.year || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

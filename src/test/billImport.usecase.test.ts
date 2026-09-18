import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDatabase } from '../database/database'
import { createBillWithItems, getBill, listBillItems, listBills, removeBillDocument } from '../domain/usecases/bills'
import { deleteDocument, getDocument, saveDocumentFile } from '../domain/usecases/documents'
import { billItemRepository } from '../domain/repositories/indexedDbRepositories'

beforeEach(async () => {
  await deleteDatabase()
})

describe('createBillWithItems (OCR import path)', () => {
  it('links the Document and carries per-item confidence/manuallyVerified through', async () => {
    const document = await saveDocumentFile(new File(['pdf'], 'abrechnung.pdf', { type: 'application/pdf' }), 'bill')

    const { bill, items } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 2100,
      documentId: document.id,
      items: [
        { categoryId: 'heating', description: 'Heizkosten', amount: 850, confidence: 0.85, sourceText: 'Heizkosten 850,00 €', manuallyVerified: false },
        { categoryId: 'water', description: 'Wasser', amount: 320, confidence: 1, sourceText: undefined, manuallyVerified: true },
      ],
    })

    expect(bill.documentId).toBe(document.id)

    expect(items).toHaveLength(2)
    expect(items[0]?.confidence).toBe(0.85)
    expect(items[0]?.manuallyVerified).toBe(false)
    expect(items[0]?.sourceText).toBe('Heizkosten 850,00 €')
    expect(items[1]?.confidence).toBe(1)
    expect(items[1]?.manuallyVerified).toBe(true)
  })

  it('still defaults to fully-confirmed items for manual entry (no documentId, no confidence given)', async () => {
    const { bill, items } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 100,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })

    expect(bill.documentId).toBeUndefined()
    expect(items[0]?.confidence).toBe(1)
    expect(items[0]?.manuallyVerified).toBe(true)
  })

  it('persists an explicitly provided totalAmount instead of the sum of items, and reloads it unchanged', async () => {
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 1200,
      totalAmount: 1300,
      items: [
        { categoryId: 'heating', description: 'Heizung', amount: 620.12, confidence: 0.9 },
        { categoryId: 'water', description: 'Wasser', amount: 184.3, confidence: 0.9 },
      ],
    })

    expect(bill.totalAmount).toBe(1300)
    expect(bill.balance).toBe(100)
    expect(bill.balanceType).toBe('payment_due')

    const reloaded = await getBill(bill.id)
    expect(reloaded?.totalAmount).toBe(1300)
  })

  it('falls back to the sum of items when no totalAmount is given (manual-entry behavior unchanged)', async () => {
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [
        { categoryId: 'heating', description: 'Heizung', amount: 100 },
        { categoryId: 'water', description: 'Wasser', amount: 50 },
      ],
    })

    expect(bill.totalAmount).toBe(150)
  })

  it('rolls back the Bill if a BillItem write fails partway through, leaving no orphaned partial Bill', async () => {
    const saveSpy = vi
      .spyOn(billItemRepository, 'save')
      .mockImplementationOnce((item) => Promise.resolve(item))
      .mockImplementationOnce(() => Promise.reject(new Error('simulated write failure')))

    await expect(
      createBillWithItems({
        type: 'annual_statement',
        year: 2025,
        advancePayments: 0,
        items: [
          { categoryId: 'heating', description: 'Heizung', amount: 100 },
          { categoryId: 'water', description: 'Wasser', amount: 50 },
        ],
      }),
    ).rejects.toThrow('simulated write failure')

    expect(await listBills()).toHaveLength(0)

    saveSpy.mockRestore()
  })
})

describe('removeBillDocument', () => {
  it('deletes the document and clears the link without touching the bill or its items', async () => {
    const document = await saveDocumentFile(new File(['pdf'], 'abrechnung.pdf', { type: 'application/pdf' }), 'bill')
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 100,
      documentId: document.id,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100, confidence: 0.9, manuallyVerified: false }],
    })

    const updated = await removeBillDocument(bill)

    expect(updated.documentId).toBeUndefined()

    const reloadedBill = await getBill(bill.id)
    expect(reloadedBill?.id).toBe(bill.id)
    expect(reloadedBill?.totalAmount).toBe(bill.totalAmount)

    const items = await listBillItems(bill.id)
    expect(items).toHaveLength(1)

    const reloadedDocument = await getDocument(document.id)
    expect(reloadedDocument?.deletedAt).not.toBeNull()
  })

  it('is a no-op when the bill has no linked document', async () => {
    const { bill } = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [{ categoryId: 'other', description: 'x', amount: 10 }],
    })

    const result = await removeBillDocument(bill)
    expect(result).toEqual(bill)
  })
})

describe('deleteDocument', () => {
  it('removes the stored bytes even when called directly', async () => {
    const document = await saveDocumentFile(new File(['bytes'], 'doc.png', { type: 'image/png' }), 'bill')
    await deleteDocument(document.id)
    const reloaded = await getDocument(document.id)
    expect(reloaded?.deletedAt).not.toBeNull()
  })
})

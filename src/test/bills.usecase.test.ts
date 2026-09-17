import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  calculateBillBalance,
  createBillWithItems,
  deleteBillWithItems,
  getBill,
  listBillItems,
  listBills,
  updateBillWithItems,
  validateBillInput,
  type BillInput,
} from '../domain/usecases/bills'

beforeEach(async () => {
  await deleteDatabase()
})

const baseInput = (overrides: Partial<BillInput> = {}): BillInput => ({
  type: 'annual_statement',
  year: 2025,
  periodStart: '2025-01-01T00:00:00.000Z',
  periodEnd: '2025-12-31T00:00:00.000Z',
  advancePayments: 2302.2,
  items: [
    { categoryId: 'heating', description: 'Heizung', amount: 850 },
    { categoryId: 'water', description: 'Wasser', amount: 320 },
    { categoryId: 'waste', description: 'Müll', amount: 180 },
    { categoryId: 'caretaker', description: 'Hausmeister', amount: 240 },
    { categoryId: 'cleaning', description: 'Reinigung', amount: 150 },
    { categoryId: 'other', description: 'Sonstiges', amount: 746.4 },
  ],
  ...overrides,
})

describe('calculateBillBalance', () => {
  it('returns Nachzahlung when total exceeds advance payments', () => {
    expect(calculateBillBalance(2486.4, 2302.2)).toEqual({ balance: 184.2, balanceType: 'payment_due' })
  })

  it('returns Guthaben when advance payments exceed total', () => {
    expect(calculateBillBalance(2000, 2200)).toEqual({ balance: 200, balanceType: 'credit' })
  })

  it('returns none when they are equal', () => {
    expect(calculateBillBalance(1000, 1000)).toEqual({ balance: 0, balanceType: 'none' })
  })
})

describe('validateBillInput', () => {
  it('accepts valid input', () => {
    expect(validateBillInput(baseInput())).toEqual([])
  })

  it('rejects negative advance payments', () => {
    expect(validateBillInput(baseInput({ advancePayments: -1 }))).toContain(
      'Vorauszahlungen dürfen nicht negativ sein.',
    )
  })

  it('rejects a bill item without a category', () => {
    expect(
      validateBillInput(baseInput({ items: [{ categoryId: '', description: 'x', amount: 10 }] })),
    ).toContain('Jede Kostenposition benötigt eine Kategorie.')
  })
})

describe('createBillWithItems', () => {
  it('sums the BillItems into totalAmount using the shared summation logic', async () => {
    const { bill, items } = await createBillWithItems(baseInput())

    expect(bill.totalAmount).toBe(2486.4)
    expect(bill.balance).toBe(184.2)
    expect(bill.balanceType).toBe('payment_due')
    expect(items).toHaveLength(6)
    expect(items.every((item) => item.billId === bill.id)).toBe(true)
  })

  it('persists the bill and items so they can be reloaded', async () => {
    const { bill } = await createBillWithItems(baseInput())

    const reloadedBill = await getBill(bill.id)
    expect(reloadedBill?.year).toBe(2025)

    const reloadedItems = await listBillItems(bill.id)
    expect(reloadedItems).toHaveLength(6)
    expect(reloadedItems.map((i) => i.amount).reduce((a, b) => a + b, 0)).toBeCloseTo(2486.4)
  })

  it('rejects invalid input without writing anything', async () => {
    await expect(createBillWithItems(baseInput({ advancePayments: -1 }))).rejects.toThrow()
    expect(await listBills()).toHaveLength(0)
  })
})

describe('updateBillWithItems', () => {
  it('replaces the item set and recomputes totals', async () => {
    const created = await createBillWithItems(baseInput())

    const updated = await updateBillWithItems(created.bill.id, baseInput({
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 500 }],
    }))

    expect(updated.bill.totalAmount).toBe(500)
    expect(updated.items).toHaveLength(1)

    const items = await listBillItems(created.bill.id)
    expect(items).toHaveLength(1)
    expect(items[0]?.amount).toBe(500)
  })

  it('throws when the bill does not exist', async () => {
    await expect(updateBillWithItems('missing', baseInput())).rejects.toThrow('nicht gefunden')
  })
})

describe('deleteBillWithItems', () => {
  it('removes the bill and cascades to its items', async () => {
    const { bill } = await createBillWithItems(baseInput())
    await deleteBillWithItems(bill.id)

    expect(await listBills()).toHaveLength(0)
    expect(await listBillItems(bill.id)).toHaveLength(0)
  })
})

describe('Bill.totalAmountConfirmed', () => {
  const twoItems = (overrides: Partial<BillInput> = {}): BillInput =>
    baseInput({
      items: [
        { categoryId: 'heating', description: 'A', amount: 100 },
        { categoryId: 'water', description: 'B', amount: 200 },
      ],
      advancePayments: 0,
      ...overrides,
    })

  it('Szenario 1: normale manuelle Bill - kein bestätigter Betrag, Edit ohne relevante Änderung behält die Summe', async () => {
    const created = await createBillWithItems(twoItems())
    expect(created.bill.totalAmount).toBe(300)
    expect(created.bill.totalAmountConfirmed).toBe(false)

    const edited = await updateBillWithItems(created.bill.id, twoItems())
    expect(edited.bill.totalAmount).toBe(300)
    expect(edited.bill.totalAmountConfirmed).toBe(false)
  })

  it('Szenario 2: Import mit bestätigtem Gesamtbetrag übernimmt und markiert ihn als bestätigt', async () => {
    const created = await createBillWithItems(twoItems({ totalAmount: 350 }))
    expect(created.bill.totalAmount).toBe(350)
    expect(created.bill.totalAmountConfirmed).toBe(true)
  })

  it('Szenario 3: bestätigte Bill bearbeiten, Items unverändert - bestätigte Summe bleibt erhalten', async () => {
    const created = await createBillWithItems(twoItems({ totalAmount: 350 }))
    const edited = await updateBillWithItems(created.bill.id, twoItems())
    expect(edited.bill.totalAmount).toBe(350)
    expect(edited.bill.totalAmountConfirmed).toBe(true)
  })

  it('Szenario 4: bestätigte Bill, Positionssumme ändert sich - Summe bleibt ohne explizite Neu-Berechnung erhalten', async () => {
    const created = await createBillWithItems(twoItems({ totalAmount: 350 }))
    const edited = await updateBillWithItems(
      created.bill.id,
      twoItems({
        items: [
          { categoryId: 'heating', description: 'A', amount: 120 },
          { categoryId: 'water', description: 'B', amount: 200 },
        ],
      }),
    )
    expect(edited.bill.totalAmount).toBe(350)
    expect(edited.bill.totalAmountConfirmed).toBe(true)

    const items = await listBillItems(created.bill.id)
    expect(items.reduce((sum, item) => sum + item.amount, 0)).toBe(320)
  })

  it('Szenario 5: explizite Neu-Berechnung verwirft die bestätigte Summe', async () => {
    const created = await createBillWithItems(twoItems({ totalAmount: 350 }))
    const edited = await updateBillWithItems(
      created.bill.id,
      twoItems({
        items: [
          { categoryId: 'heating', description: 'A', amount: 120 },
          { categoryId: 'water', description: 'B', amount: 200 },
        ],
        recalculateTotalAmount: true,
      }),
    )
    expect(edited.bill.totalAmount).toBe(320)
    expect(edited.bill.totalAmountConfirmed).toBe(false)
  })

  it('Szenario 6: nach einer Neu-Berechnung verhält sich ein weiteres Edit wieder wie eine normale Bill', async () => {
    const created = await createBillWithItems(twoItems({ totalAmount: 350 }))
    const recalculated = await updateBillWithItems(
      created.bill.id,
      twoItems({
        items: [
          { categoryId: 'heating', description: 'A', amount: 120 },
          { categoryId: 'water', description: 'B', amount: 200 },
        ],
        recalculateTotalAmount: true,
      }),
    )
    expect(recalculated.bill.totalAmountConfirmed).toBe(false)

    const next = await updateBillWithItems(
      recalculated.bill.id,
      twoItems({
        items: [
          { categoryId: 'heating', description: 'A', amount: 90 },
          { categoryId: 'water', description: 'B', amount: 200 },
        ],
      }),
    )
    expect(next.bill.totalAmount).toBe(290)
    expect(next.bill.totalAmountConfirmed).toBe(false)
  })
})

describe('listBills', () => {
  it('sorts newest year first', async () => {
    await createBillWithItems(baseInput({ year: 2023, items: [{ categoryId: 'heating', description: 'x', amount: 1 }] }))
    await createBillWithItems(baseInput({ year: 2025, items: [{ categoryId: 'heating', description: 'x', amount: 1 }] }))
    await createBillWithItems(baseInput({ year: 2024, items: [{ categoryId: 'heating', description: 'x', amount: 1 }] }))

    const years = (await listBills()).map((b) => b.year)
    expect(years).toEqual([2025, 2024, 2023])
  })
})

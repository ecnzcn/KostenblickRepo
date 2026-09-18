import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import type { BillItem } from '../domain/models/entities'
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
  type BillItemInput,
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

describe('BillItem provenance on update', () => {
  function asInput(item: BillItem, overrides: Partial<BillItemInput> = {}): BillItemInput {
    return {
      id: item.id,
      categoryId: item.categoryId ?? '',
      description: item.description,
      amount: item.amount,
      confidence: item.confidence,
      sourceText: item.sourceText,
      manuallyVerified: item.manuallyVerified,
      ...overrides,
    }
  }

  async function createOcrBill() {
    return createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [
        {
          categoryId: 'heating',
          description: 'Heizung (erkannt)',
          amount: 100,
          confidence: 0.42,
          sourceText: 'Heizkosten 100,00',
          manuallyVerified: false,
        },
        {
          categoryId: 'water',
          description: 'Wasser (erkannt)',
          amount: 200,
          confidence: 0.81,
          sourceText: 'Wasserkosten 200,00',
          manuallyVerified: false,
        },
      ],
    })
  }

  it('Test 1: unverändertes OCR-Item speichern - id, createdAt und Metadaten bleiben exakt erhalten', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemA!), asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    expect(reloadedA.id).toBe(itemA!.id)
    expect(reloadedA.createdAt).toBe(itemA!.createdAt)
    expect(reloadedA.confidence).toBe(0.42)
    expect(reloadedA.sourceText).toBe('Heizkosten 100,00')
    expect(reloadedA.manuallyVerified).toBe(false)
  })

  it('Test 2: Betrag eines OCR-Items ändern - id/createdAt bleiben, confidence=1, manuallyVerified=true, sourceText bleibt erhalten', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      // The changed confidence/manuallyVerified mirror what BillItemRow's
      // markEdited already computes in the UI the moment a field of an
      // existing item changes - the usecase itself never guesses this.
      items: [asInput(itemA!, { amount: 150, confidence: 1, manuallyVerified: true }), asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    expect(reloadedA.id).toBe(itemA!.id)
    expect(reloadedA.createdAt).toBe(itemA!.createdAt)
    expect(reloadedA.amount).toBe(150)
    expect(reloadedA.confidence).toBe(1)
    expect(reloadedA.manuallyVerified).toBe(true)
    expect(reloadedA.sourceText).toBe('Heizkosten 100,00')
  })

  it('Test 3: Kategorie eines OCR-Items ändern - gleiche Verifikations-Semantik', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemA!, { categoryId: 'electricity', confidence: 1, manuallyVerified: true }), asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    expect(reloadedA.categoryId).toBe('electricity')
    expect(reloadedA.confidence).toBe(1)
    expect(reloadedA.manuallyVerified).toBe(true)
    expect(reloadedA.sourceText).toBe('Heizkosten 100,00')
  })

  it('Test 4: Beschreibung eines OCR-Items ändern - gleiche Verifikations-Semantik', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemA!, { description: 'Heizung (korrigiert)', confidence: 1, manuallyVerified: true }), asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    expect(reloadedA.description).toBe('Heizung (korrigiert)')
    expect(reloadedA.confidence).toBe(1)
    expect(reloadedA.manuallyVerified).toBe(true)
    expect(reloadedA.sourceText).toBe('Heizkosten 100,00')
  })

  it('Test 5: OCR-Item löschen - Item wird vollständig soft-deleted', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    expect(reloaded.map((item) => item.id)).toEqual([itemB!.id])
    expect(reloaded.find((item) => item.id === itemA!.id)).toBeUndefined()
  })

  it('Test 6: neues manuelles Item hinzufügen - neue id, Default-Provenienz, keine falschen OCR-Metadaten', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    const updated = await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemA!), asInput(itemB!), { categoryId: 'other', description: 'Neu erfasst', amount: 50 }],
    })

    const newItem = updated.items.find((item) => item.description === 'Neu erfasst')!
    expect(newItem.id).not.toBe(itemA!.id)
    expect(newItem.id).not.toBe(itemB!.id)
    expect(newItem.confidence).toBe(1)
    expect(newItem.manuallyVerified).toBe(true)
    expect(newItem.sourceText).toBeUndefined()
  })

  it('Test 7: Reordering - Metadaten bleiben anhand der id korrekt zugeordnet, nie anhand der Position', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      // Reihenfolge im übermittelten Array vertauscht - B zuerst, A zuletzt.
      items: [asInput(itemB!), asInput(itemA!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    const reloadedB = reloaded.find((item) => item.id === itemB!.id)!
    expect(reloadedA.confidence).toBe(0.42)
    expect(reloadedA.sourceText).toBe('Heizkosten 100,00')
    expect(reloadedB.confidence).toBe(0.81)
    expect(reloadedB.sourceText).toBe('Wasserkosten 200,00')
  })

  it('Test 8: mehrere OCR-Items - unterschiedliche Confidence-/sourceText-Werte werden nie vermischt', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    // Nur Item A wird bearbeitet, Item B bleibt vollständig unangetastet.
    await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(itemA!, { amount: 111, confidence: 1, manuallyVerified: true }), asInput(itemB!)],
    })

    const reloaded = await listBillItems(created.bill.id)
    const reloadedA = reloaded.find((item) => item.id === itemA!.id)!
    const reloadedB = reloaded.find((item) => item.id === itemB!.id)!
    expect(reloadedA.confidence).toBe(1)
    expect(reloadedA.manuallyVerified).toBe(true)
    expect(reloadedB.confidence).toBe(0.81)
    expect(reloadedB.manuallyVerified).toBe(false)
    expect(reloadedB.sourceText).toBe('Wasserkosten 200,00')
  })

  it('Test 9: Legacy-Item ohne OCR-Metadaten - Edit funktioniert ohne Fehler, bestehende Defaults greifen', async () => {
    const created = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [{ categoryId: 'heating', description: 'Heizung', amount: 100 }],
    })
    const [legacyItem] = created.items

    const updated = await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [{ id: legacyItem!.id, categoryId: 'heating', description: 'Heizung', amount: 120 }],
    })

    expect(updated.items[0]!.id).toBe(legacyItem!.id)
    expect(updated.items[0]!.amount).toBe(120)
    expect(updated.items[0]!.confidence).toBe(1)
    expect(updated.items[0]!.manuallyVerified).toBe(true)
  })

  it('Test 10: Phase-10-Regression - totalAmountConfirmed bleibt unabhängig von der Item-Provenienz korrekt', async () => {
    const created = await createBillWithItems({
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      totalAmount: 350,
      items: [
        {
          categoryId: 'heating',
          description: 'Heizung (erkannt)',
          amount: 100,
          confidence: 0.42,
          sourceText: 'Heizkosten 100,00',
          manuallyVerified: false,
        },
      ],
    })
    expect(created.bill.totalAmountConfirmed).toBe(true)
    const [item] = created.items

    const edited = await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [asInput(item!, { amount: 120, confidence: 1, manuallyVerified: true })],
    })

    // Phase-10-Verhalten unverändert: der bestätigte Gesamtbetrag bleibt
    // trotz Item-Änderung erhalten, ohne explizite Neuberechnung.
    expect(edited.bill.totalAmount).toBe(350)
    expect(edited.bill.totalAmountConfirmed).toBe(true)
    // Die Item-Provenienz wird davon unabhängig korrekt behandelt.
    const reloadedItem = edited.items[0]!
    expect(reloadedItem.id).toBe(item!.id)
    expect(reloadedItem.createdAt).toBe(item!.createdAt)
    expect(reloadedItem.confidence).toBe(1)
    expect(reloadedItem.manuallyVerified).toBe(true)
  })

  it('unbekannte/fremde id in einem Input wird nie als bestehendes Item akzeptiert', async () => {
    const created = await createOcrBill()
    const [itemA, itemB] = created.items

    const updated = await updateBillWithItems(created.bill.id, {
      type: 'annual_statement',
      year: 2025,
      advancePayments: 0,
      items: [
        { id: 'does-not-exist', categoryId: 'heating', description: 'Manipuliert', amount: 999 },
        asInput(itemA!),
        asInput(itemB!),
      ],
    })

    const injected = updated.items.find((item) => item.description === 'Manipuliert')!
    expect(injected.id).not.toBe('does-not-exist')
    expect(injected.confidence).toBe(1)
    expect(injected.manuallyVerified).toBe(true)
    // Die echten bestehenden Items sind von der unbekannten id unangetastet.
    expect(updated.items.find((item) => item.id === itemA!.id)?.confidence).toBe(0.42)
    expect(updated.items.find((item) => item.id === itemB!.id)?.confidence).toBe(0.81)
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

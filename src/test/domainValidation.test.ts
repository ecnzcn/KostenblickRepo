import { describe, expect, it } from 'vitest'
import { sumBillItems, validateBill, validateBillItem, validateContract } from '../domain/usecases/validation'
import type { Bill, BillItem, Contract } from '../domain/models/entities'

const base = { id: '1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, syncVersion: 1 }

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  ...base, userId: 'u1', type: 'annual_statement', year: 2026, totalAmount: 1200,
  advancePayments: 1000, balance: 200, balanceType: 'payment_due', ocrStatus: 'not_started', ...overrides,
})

const item = (overrides: Partial<BillItem> = {}): BillItem => ({
  ...base, billId: 'b1', description: 'Heizung', amount: 120, confidence: 0.95, manuallyVerified: false, ...overrides,
})

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  ...base, userId: 'u1', categoryId: 'internet', provider: 'Provider', monthlyCost: 40,
  startDate: '2026-01-01', autoRenewal: true, reminderEnabled: true, ...overrides,
})

describe('domain validation', () => {
  it('accepts a valid bill', () => expect(validateBill(bill())).toEqual([]))
  it('rejects invalid bill amounts', () => expect(validateBill(bill({ totalAmount: -1 }))).toContain('Gesamtbetrag darf nicht negativ sein.'))
  it('validates OCR confidence', () => expect(validateBillItem(item({ confidence: 1.2 }))).toContain('Confidence muss zwischen 0 und 1 liegen.'))
  it('requires a provider for contracts', () => expect(validateContract(contract({ provider: ' ' }))).toContain('Anbieter darf nicht leer sein.'))
  it('requires a unit when a cancellation period is supplied', () => expect(validateContract(contract({ cancellationPeriodValue: 30 }))).toContain('Kündigungsfrist benötigt eine Einheit.'))
  it('requires a contract start date', () => expect(validateContract(contract({ startDate: '' }))).toContain('Vertragsbeginn ist erforderlich.'))
  it('rejects a contract end date before the start date', () =>
    expect(
      validateContract(contract({ startDate: '2026-06-01', endDate: '2026-01-01' })),
    ).toContain('Vertragsende darf nicht vor Vertragsbeginn liegen.'))
  it('accepts a contract end date on or after the start date', () =>
    expect(validateContract(contract({ startDate: '2026-01-01', endDate: '2026-01-01' }))).toEqual([]))
  it('sums bill items', () => expect(sumBillItems([item({ amount: 10 }), item({ amount: 20.5 })])).toBe(30.5))
})

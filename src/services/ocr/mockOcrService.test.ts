import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../../database/database'
import { MockOCRService } from './MockOCRService'

beforeEach(async () => {
  await deleteDatabase()
})

function fakeBillFile(): File {
  return new File(['fake bytes'], 'abrechnung.pdf', { type: 'application/pdf' })
}

describe('MockOCRService', () => {
  it('is clearly a mock - extractText never reads the actual file bytes', async () => {
    const service = new MockOCRService()
    const result = await service.extractText(fakeBillFile())
    expect(result.rawText).not.toContain('fake bytes')
    expect(result.rawText.length).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('analyzeDocument returns per-field results with confidence and source text', async () => {
    const service = new MockOCRService()
    const result = await service.analyzeDocument(fakeBillFile())

    expect(result.rawText.length).toBeGreaterThan(0)
    const totalField = result.fields.find((field) => field.field === 'totalAmount')
    expect(totalField).toBeDefined()
    expect(totalField?.confidence).toBeGreaterThan(0)
    expect(totalField?.sourceText.length).toBeGreaterThan(0)
  })

  it('extractBillData returns a ParsedBill with recognized items and confidence-flagged fields', async () => {
    const service = new MockOCRService()
    const parsedBill = await service.extractBillData(fakeBillFile())

    expect(parsedBill.year.value).toBeGreaterThan(2000)
    expect(parsedBill.totalAmount.value).toBeGreaterThan(0)
    expect(parsedBill.advancePayments.value).toBeGreaterThan(0)
    expect(parsedBill.items.length).toBeGreaterThan(0)
    for (const item of parsedBill.items) {
      expect(item.confidence).toBeGreaterThanOrEqual(0)
      expect(item.confidence).toBeLessThanOrEqual(1)
      expect(item.categoryId).toBeTruthy()
    }
  })

  it('never marks OCR-recognized items as manually verified - that only happens through user review', async () => {
    const service = new MockOCRService()
    const parsedBill = await service.extractBillData(fakeBillFile())
    // ParsedBillItem has no manuallyVerified flag by design: it only exists
    // once turned into a BillItem after the user reviews it.
    expect(parsedBill.items[0]).not.toHaveProperty('manuallyVerified')
  })
})

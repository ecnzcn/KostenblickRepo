// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import type { Transaction } from '../domain/models/entities'
import { categoryRuleRepository, transactionRepository } from '../domain/repositories/financeRepositories'
import { commitImport, getImportOverview, prepareImport, undoImport } from '../domain/usecases/bankImport/importTransactions'
import {
  countRuleMatches,
  createRule,
  deleteRule,
  listRules,
  listUncategorized,
  setTransactionAssignment,
  suggestRuleDrafts,
} from '../domain/usecases/categorization/transactionCategorization'

async function importFixture(name: string): Promise<void> {
  const file = new File([readFileSync(new URL(`./fixtures/sparkasse/${name}`, import.meta.url))], name)
  const result = await prepareImport(file)
  if (!result.ok) throw new Error(result.error)
  await commitImport(result.preview)
}

async function find(predicate: (entry: Transaction) => boolean): Promise<Transaction[]> {
  return (await transactionRepository.getAll()).filter(predicate)
}

const GIRO = 'sparkasse-giro-camt-v2-sample.csv'

beforeEach(async () => {
  await deleteDatabase()
})

describe('manual categorization', () => {
  it('stores the choice as manual and couples flow and category', async () => {
    await importFixture(GIRO)
    const [booking] = await listUncategorized()
    const updated = await setTransactionAssignment(booking?.id ?? '', { kind: 'category', categoryId: 'leisure' })
    expect(updated).toMatchObject({ categoryId: 'leisure', categorySource: 'manual', flowType: 'expense', flowTypeSource: 'manual' })

    const saving = await setTransactionAssignment(booking?.id ?? '', { kind: 'saving' })
    expect(saving).toMatchObject({ categoryId: 'savings', flowType: 'saving' })
    const transfer = await setTransactionAssignment(booking?.id ?? '', { kind: 'transfer' })
    expect(transfer.flowType).toBe('transfer')
    expect(transfer.categoryId).toBeUndefined()
  })

  it('releases a card settlement pair when one half is re-assigned by hand', async () => {
    await importFixture(GIRO)
    await importFixture('sparkasse-kreditkarte-sample.csv')
    const [giroSettlement] = await find((entry) => entry.bookingDate === '2026-09-18' && entry.amount === -2232.77)
    expect(giroSettlement?.transferPairId).toBeDefined()

    await setTransactionAssignment(giroSettlement?.id ?? '', { kind: 'category', categoryId: 'leisure' })
    const [cardSide] = await find((entry) => entry.amount === 2232.77)
    expect(cardSide?.transferPairId).toBeUndefined()
    expect(cardSide?.flowType).toBe('transfer')
  })
})

describe('"Immer so zuordnen?" rules', () => {
  it('suggests the most precise field first', async () => {
    await importFixture(GIRO)
    const [withCreditor] = await find((entry) => Boolean(entry.creditorId))
    expect(suggestRuleDrafts(withCreditor as Transaction)[0]?.field).toBe('creditorId')
  })

  it('applies a new rule to matching bookings but never to manual ones', async () => {
    await importFixture(GIRO)
    const sameCounterparty = await find((entry) => entry.counterpartyName === 'Gegenpartei 014')
    expect(sameCounterparty.length).toBeGreaterThan(2)
    const [first, second] = sameCounterparty as [Transaction, Transaction]

    await setTransactionAssignment(second.id, { kind: 'category', categoryId: 'health' })
    await setTransactionAssignment(first.id, { kind: 'category', categoryId: 'leisure' })
    const draft = { field: 'counterpartyName' as const, matchType: 'contains' as const, pattern: 'Gegenpartei 014' }
    expect(await countRuleMatches(draft, first.id)).toBe(sameCounterparty.length - 2)

    const changed = await createRule({ ...draft, choice: { kind: 'category', categoryId: 'leisure' }, applyToExisting: true })
    const after = await find((entry) => entry.counterpartyName === 'Gegenpartei 014')
    expect(after.find((entry) => entry.id === second.id)).toMatchObject({ categoryId: 'health', categorySource: 'manual' })
    const ruled = after.filter((entry) => entry.categorySource === 'rule')
    expect(ruled.length).toBe(changed)
    expect(ruled.length).toBeGreaterThan(0)
    expect(ruled.every((entry) => entry.categoryId === 'leisure' && entry.flowType === 'expense')).toBe(true)
  })

  it('marks an own account by IBAN as saving', async () => {
    await importFixture(GIRO)
    const toOwnAccount = await find((entry) => entry.counterpartyName === 'Gegenpartei 013' && Boolean(entry.counterpartyIban))
    const [source] = toOwnAccount as [Transaction]
    await setTransactionAssignment(source.id, { kind: 'saving' })
    await createRule({ field: 'counterpartyIban', matchType: 'equals', pattern: source.counterpartyIban ?? '', choice: { kind: 'saving' }, applyToExisting: true })

    const sameIban = await find((entry) => entry.counterpartyIban === source.counterpartyIban)
    expect(sameIban.every((entry) => entry.flowType === 'saving')).toBe(true)
  })

  it('does not touch existing bookings without "auf bestehende anwenden", but uses the rule for the next import', async () => {
    await importFixture(GIRO)
    const draft = { field: 'counterpartyName' as const, matchType: 'contains' as const, pattern: 'Gegenpartei 005' }
    expect(await createRule({ ...draft, choice: { kind: 'category', categoryId: 'clothing' }, applyToExisting: false })).toBe(0)
    expect((await find((entry) => entry.counterpartyName === 'Gegenpartei 005')).some((entry) => entry.categoryId === 'clothing')).toBe(false)

    const [giroImport] = (await getImportOverview()).imports
    await undoImport(giroImport?.batch.id ?? '')
    await importFixture(GIRO)
    const reimported = await find((entry) => entry.counterpartyName === 'Gegenpartei 005' && entry.amount < 0)
    expect(reimported.length).toBeGreaterThan(0)
    expect(reimported.every((entry) => entry.categoryId === 'clothing' && entry.categorySource === 'rule')).toBe(true)
  })

  it('deleting a rule leaves the categorized bookings as they are', async () => {
    await importFixture(GIRO)
    await createRule({ field: 'counterpartyName', matchType: 'contains', pattern: 'Gegenpartei 005', choice: { kind: 'category', categoryId: 'clothing' }, applyToExisting: true })
    const [entry] = await listRules()
    expect(entry?.description).toBe('Name der Gegenpartei enthält „Gegenpartei 005“')
    expect(entry?.target).toBe('Kleidung')

    await deleteRule(entry?.rule.id ?? '')
    expect(await categoryRuleRepository.getAll()).toEqual([])
    expect((await find((booking) => booking.counterpartyName === 'Gegenpartei 005' && booking.amount < 0)).every((booking) => booking.categoryId === 'clothing')).toBe(true)
  })

  it('rejects an empty pattern', async () => {
    await expect(createRule({ field: 'purpose', matchType: 'contains', pattern: '  ', choice: { kind: 'transfer' }, applyToExisting: false })).rejects.toThrow(
      'Bitte gib an',
    )
  })
})

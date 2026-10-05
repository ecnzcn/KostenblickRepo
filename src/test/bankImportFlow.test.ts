// Node environment: Windows-1252 fixture bytes, File and Web Crypto from
// Node, real (fake-)IndexedDB round-trips.
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { CREDIT_CARD_UNITEMIZED_CATEGORY_ID } from '../constants/categories'
import { deleteDatabase } from '../database/database'
import type { ParsedBankRow } from '../domain/models/bankImport'
import type { Account, Transaction } from '../domain/models/entities'
import { accountRepository, importBatchRepository, transactionRepository } from '../domain/repositories/financeRepositories'
import { classifyBankRow } from '../domain/usecases/bankImport/classifyBankRow'
import {
  COMMIT_FAILED_MESSAGE,
  commitImport,
  getImportOverview,
  prepareImport,
  undoImport,
  type ImportPreview,
} from '../domain/usecases/bankImport/importTransactions'
import { isProvisionalSettlement, reconcileCardSettlements } from '../domain/usecases/bankImport/reconcileCardSettlements'

const GIRO = 'sparkasse-giro-camt-v2-sample.csv'
const CARD = 'sparkasse-kreditkarte-sample.csv'
const EDGE = 'sparkasse-giro-edgecases.csv'

function fixtureFile(name: string): File {
  return new File([readFileSync(new URL(`./fixtures/sparkasse/${name}`, import.meta.url))], name, { type: 'text/csv' })
}

async function preview(name: string): Promise<ImportPreview> {
  const result = await prepareImport(fixtureFile(name), new Date('2026-10-05T10:00:00.000Z'))
  if (!result.ok) throw new Error(result.error)
  return result.preview
}

function row(overrides: Partial<ParsedBankRow>): ParsedBankRow {
  return {
    line: 2,
    raw: {},
    bookingDate: '2026-09-01',
    amount: -10,
    currency: 'EUR',
    counterpartyName: 'Gegenpartei',
    purpose: '',
    bookingText: 'KARTENZAHLUNG',
    ...overrides,
  }
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('classifyBankRow', () => {
  it('uses the Sparkasse category as a starting suggestion', () => {
    expect(classifyBankRow(row({ bankCategory: 'Lebensmittel und Drogerie' }), 'giro')).toEqual({
      flowType: 'expense',
      categoryId: 'groceries',
      categorySource: 'bank',
    })
    expect(classifyBankRow(row({ bankCategory: 'Sonstiges' }), 'giro')).toEqual({ flowType: 'expense', categorySource: 'none' })
  })

  it('treats positive amounts as income (O-8) and recognises salary (O-10)', () => {
    expect(classifyBankRow(row({ amount: 2850, bookingText: 'LOHN  GEHALT', bankCategory: 'Einkommen' }), 'giro')).toMatchObject({
      flowType: 'income',
      categoryId: 'salary',
    })
    expect(classifyBankRow(row({ amount: 120, bankCategory: 'Einkommen' }), 'giro')).toMatchObject({ categoryId: 'other_income' })
    // A refund in an expense category is income without a (wrong) expense category.
    expect(classifyBankRow(row({ amount: 221.14, bankCategory: 'Wohnen und Garten' }), 'giro')).toEqual({
      flowType: 'income',
      categorySource: 'none',
    })
  })

  it('applies the structural rules before the bank category', () => {
    expect(classifyBankRow(row({ bookingText: 'EIGENE KREDITKARTENABRECHN.', bankCategory: 'Sonstiges' }), 'giro')).toMatchObject({
      flowType: 'expense',
      categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID,
    })
    expect(classifyBankRow(row({ bookingText: 'UEBERTRAG (UEBERWEISUNG)', bankCategory: 'Sonstiges' }), 'giro')).toMatchObject({
      flowType: 'saving',
    })
    expect(classifyBankRow(row({ amount: 76.36, bookingText: 'UEBERTRAG (GUTSCHR. UEBERW)' }), 'giro')).toMatchObject({
      flowType: 'saving',
    })
    expect(classifyBankRow(row({ bookingText: 'DAUERAUFTRAG', bankCategory: 'Geldanlage' }), 'giro')).toMatchObject({
      flowType: 'saving',
      categorySource: 'bank',
    })
    expect(
      classifyBankRow(row({ amount: 36.43, bookingText: 'LS WIEDERGUTSCHRIFT', bankCategory: 'Einkäufe' }), 'giro'),
    ).toEqual({ flowType: 'expense', isReversal: true, categoryId: 'shopping', categorySource: 'bank' })
    expect(classifyBankRow(row({ amount: 11538.74, bookingText: 'BARGELDEINZAHLUNG SB', bankCategory: 'Bargeld' }), 'giro')).toMatchObject({
      flowType: 'income',
      categoryId: 'other_income',
    })
    expect(classifyBankRow(row({ bookingText: 'ENTGELTABSCHLUSS' }), 'giro')).toMatchObject({ categoryId: 'fees' })
  })

  it('classifies credit card rows', () => {
    expect(classifyBankRow(row({ amount: 2232.77, bookingText: 'LASTSCHRIFT' }), 'credit_card')).toEqual({
      flowType: 'transfer',
      categorySource: 'none',
    })
    expect(classifyBankRow(row({ amount: -0.49, bookingText: 'GEBUEHR' }), 'credit_card')).toMatchObject({ categoryId: 'fees' })
    expect(classifyBankRow(row({ bookingText: 'KARTENUMSATZ' }), 'credit_card')).toEqual({ flowType: 'expense', categorySource: 'none' })
  })
})

describe('reconcileCardSettlements', () => {
  const giro: Account = { id: 'giro', name: 'G', bank: 'sparkasse', type: 'giro', last4: '1', identifierHash: '', identifierSalt: '', createdAt: '', updatedAt: '' }
  const card: Account = { ...giro, id: 'card', type: 'credit_card' }

  function tx(id: string, accountId: string, bookingDate: string, amount: number, bookingText: string, extra: Partial<Transaction> = {}): Transaction {
    const base: Transaction = {
      id,
      accountId,
      bookingDate,
      amount,
      currency: 'EUR',
      counterpartyName: '',
      purpose: '',
      bookingText,
      categorySource: 'none',
      flowType: amount < 0 ? 'expense' : 'income',
      flowTypeSource: 'auto',
      importBatchId: 'b',
      dedupeKey: id,
      createdAt: '',
      updatedAt: '',
      ...extra,
    }
    if (bookingText === 'EIGENE KREDITKARTENABRECHN.') return { ...base, categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, categorySource: 'rule', ...extra }
    if (bookingText === 'LASTSCHRIFT') return { ...base, flowType: 'transfer', ...extra }
    return base
  }

  function apply(transactions: Transaction[]): Map<string, Transaction> {
    const byId = new Map(transactions.map((entry) => [entry.id, entry]))
    for (const change of reconcileCardSettlements(transactions, [giro, card])) byId.set(change.id, change)
    return byId
  }

  it('pairs a giro settlement with the card "Lastschrift" a few days earlier', () => {
    const state = apply([
      tx('g', 'giro', '2026-09-18', -2232.77, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c', 'card', '2026-09-14', 2232.77, 'LASTSCHRIFT'),
    ])
    expect(state.get('g')).toMatchObject({ flowType: 'transfer', transferPairId: 'c', categorySource: 'none' })
    expect(state.get('g')?.categoryId).toBeUndefined()
    expect(state.get('c')).toMatchObject({ flowType: 'transfer', transferPairId: 'g' })
  })

  it('does not pair different amounts or more than 10 days apart', () => {
    const state = apply([
      tx('g1', 'giro', '2026-09-18', -100, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c1', 'card', '2026-09-14', 100.01, 'LASTSCHRIFT'),
      tx('g2', 'giro', '2026-09-25', -50, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c2', 'card', '2026-09-14', 50, 'LASTSCHRIFT'),
    ])
    expect(state.get('g1')).toMatchObject({ flowType: 'expense', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID })
    expect(state.get('g2')).toMatchObject({ flowType: 'expense' })
    expect(state.get('c1')?.transferPairId).toBeUndefined()
  })

  it('counts an unpaired settlement as provisional transfer when card bookings for its period exist (O-1)', () => {
    const state = apply([
      tx('g-sep', 'giro', '2026-09-18', -2232.77, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c-sep', 'card', '2026-09-14', 2232.77, 'LASTSCHRIFT'),
      tx('p1', 'card', '2026-09-20', -40, 'KARTENUMSATZ'),
      tx('g-oct', 'giro', '2026-10-18', -900, 'EIGENE KREDITKARTENABRECHN.'),
    ])
    expect(state.get('g-oct')).toMatchObject({ flowType: 'transfer' })
    expect(state.get('g-oct')?.transferPairId).toBeUndefined()
    expect(isProvisionalSettlement(state.get('g-oct') as Transaction)).toBe(true)
  })

  it('keeps an unpaired settlement as expense without any card data for its period', () => {
    const state = apply([
      tx('g', 'giro', '2026-07-20', -2.9, 'EIGENE KREDITKARTENABRECHN.'),
      tx('p1', 'card', '2026-07-18', -40, 'KARTENUMSATZ'),
    ])
    expect(state.get('g')).toMatchObject({ flowType: 'expense', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID })
  })

  it('reverts a pair once the card side is gone', () => {
    const paired = apply([
      tx('g', 'giro', '2026-09-18', -100, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c', 'card', '2026-09-14', 100, 'LASTSCHRIFT'),
    ])
    const state = apply([paired.get('g') as Transaction])
    expect(state.get('g')).toMatchObject({ flowType: 'expense', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, categorySource: 'rule' })
    expect(state.get('g')?.transferPairId).toBeUndefined()
  })

  it('never changes a manually set flow and keeps a manual category', () => {
    const manual = tx('g', 'giro', '2026-09-18', -100, 'EIGENE KREDITKARTENABRECHN.', { flowTypeSource: 'manual' })
    expect(reconcileCardSettlements([manual, tx('c', 'card', '2026-09-14', 100, 'LASTSCHRIFT')], [giro, card])).toEqual([])

    const manualCategory = tx('g2', 'giro', '2026-09-18', -100, 'EIGENE KREDITKARTENABRECHN.', { categoryId: 'leisure', categorySource: 'manual' })
    const state = apply([manualCategory, tx('c2', 'card', '2026-09-14', 100, 'LASTSCHRIFT')])
    expect(state.get('g2')).toMatchObject({ flowType: 'transfer', categoryId: 'leisure', categorySource: 'manual' })
  })

  it('pairs 1:1 when two settlements have the same amount', () => {
    const state = apply([
      tx('g1', 'giro', '2026-08-18', -100, 'EIGENE KREDITKARTENABRECHN.'),
      tx('g2', 'giro', '2026-09-18', -100, 'EIGENE KREDITKARTENABRECHN.'),
      tx('c1', 'card', '2026-08-14', 100, 'LASTSCHRIFT'),
      tx('c2', 'card', '2026-09-14', 100, 'LASTSCHRIFT'),
    ])
    expect(state.get('g1')?.transferPairId).toBe('c1')
    expect(state.get('g2')?.transferPairId).toBe('c2')
  })
})

describe('import flow (real IndexedDB)', () => {
  it('builds a preview without storing anything', async () => {
    const result = await preview(GIRO)
    expect(result.isNewAccount).toBe(true)
    expect(result.account.name).toBe('Girokonto ••0001')
    expect(result.counts).toEqual({ total: 117, new: 117, duplicates: 0, skippedPending: 0 })
    expect([result.periodFrom, result.periodTo]).toEqual(['2024-12-09', '2026-09-22'])
    expect(await transactionRepository.getAll()).toEqual([])
    expect(await accountRepository.getAll()).toEqual([])
    expect(await importBatchRepository.getAll()).toEqual([])
  })

  it('sums the preview by flow and counts uncategorized bookings', async () => {
    const result = await preview(EDGE)
    expect(result.counts).toMatchObject({ new: 7, skippedPending: 1 })
    expect(result.totals).toEqual({ income: 1234.56, expenses: 726.52, saved: 200 })
    expect(result.uncategorizedCount).toBe(1)
  })

  it('stores account, import and bookings on commit and recognises the account next time', async () => {
    await commitImport(await preview(GIRO), 'Mein Giro')
    expect(await transactionRepository.getAll()).toHaveLength(117)
    expect((await accountRepository.getAll()).map((account) => account.name)).toEqual(['Mein Giro'])

    const again = await preview(GIRO)
    expect(again.isNewAccount).toBe(false)
    expect(again.counts).toMatchObject({ new: 0, duplicates: 117 })
    await expect(commitImport(again)).rejects.toThrow('keine neuen Buchungen')
  })

  it('pairs the card settlements when the card export follows', async () => {
    await commitImport(await preview(GIRO))
    const result = await commitImport(await preview(CARD))
    expect(result).toMatchObject({ imported: 66, pairedSettlements: 2, provisionalSettlements: 0, cardDataFrom: '2026-07-16' })

    const settlements = (await transactionRepository.getAll()).filter((entry) => entry.bookingText === 'EIGENE KREDITKARTENABRECHN.')
    const byDate = Object.fromEntries(settlements.map((entry) => [entry.bookingDate, entry.flowType]))
    expect(byDate).toEqual({ '2026-09-18': 'transfer', '2026-08-20': 'transfer', '2026-07-20': 'expense', '2026-06-19': 'expense' })
  })

  it('undoes an import completely and lets the same file be imported again', async () => {
    await commitImport(await preview(GIRO))
    await commitImport(await preview(CARD))
    const cardImport = (await getImportOverview()).imports.find((entry) => entry.batch.filename === CARD)
    await undoImport(cardImport?.batch.id ?? '')

    const all = await transactionRepository.getAll()
    expect(all).toHaveLength(117)
    expect(all.filter((entry) => entry.flowType === 'transfer')).toEqual([])
    expect(all.some((entry) => entry.transferPairId)).toBe(false)

    const again = await preview(CARD)
    expect(again.counts.new).toBe(66)
    await commitImport(again)
    expect(await transactionRepository.getAll()).toHaveLength(183)
  })

  it('leaves nothing behind when saving fails', async () => {
    const broken = await preview(EDGE)
    const [first, second] = broken.newTransactions
    broken.newTransactions = [first, { ...(second as Transaction), dedupeKey: (first as Transaction).dedupeKey }] as Transaction[]

    await expect(commitImport(broken)).rejects.toThrow(COMMIT_FAILED_MESSAGE)
    expect(await transactionRepository.getAll()).toEqual([])
    expect(await accountRepository.getAll()).toEqual([])
    expect(await importBatchRepository.getAll()).toEqual([])
  })

  it('refuses to commit a preview with broken rows', async () => {
    const result = await preview(EDGE)
    await expect(commitImport({ ...result, errors: [{ line: 3, message: 'Zeile 3: …' }] })).rejects.toThrow('fehlerhafte Zeilen')
    expect(await transactionRepository.getAll()).toEqual([])
  })
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import { STORE_NAMES } from '../database/schema'
import type { Transaction } from '../domain/models/entities'
import { categoryRuleRepository, transactionRepository } from '../domain/repositories/financeRepositories'
import { commitImport, prepareImport } from '../domain/usecases/bankImport/importTransactions'
import { listRules, setTransactionAssignment } from '../domain/usecases/categorization/transactionCategorization'
import { createContract, deleteContract, updateContract, type ContractInput } from '../domain/usecases/contracts'
import { getContractBookings, getFixedCostData, fixedCostOverviewFor, linkContract, unlinkContract } from '../domain/usecases/fixedCosts/contractLinks'

async function importFixture(name: string): Promise<void> {
  const file = new File([readFileSync(new URL(`./fixtures/sparkasse/${name}`, import.meta.url))], name)
  const result = await prepareImport(file)
  if (!result.ok) throw new Error(result.error)
  await commitImport(result.preview)
}

async function bookingsOf(counterpartyName: string): Promise<Transaction[]> {
  return (await transactionRepository.getAll()).filter((entry) => entry.counterpartyName === counterpartyName && entry.amount < 0)
}

const POWER: ContractInput = {
  categoryId: 'electricity',
  provider: 'Stadtwerke',
  tariff: 'Strom',
  monthlyCost: 85.33,
  startDate: '2025-01-01',
  autoRenewal: true,
  reminderEnabled: false,
}

const NOW = new Date('2026-10-05T10:00:00Z')

beforeEach(async () => {
  await deleteDatabase()
})

describe('linking a contract to bookings', () => {
  it('suggests the debits, links them on confirmation and follows the contract category', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const contract = await createContract(POWER)

    const before = await getContractBookings(contract, NOW)
    expect(before.comparison.bookings).toEqual([])
    const [suggestion] = before.suggestions
    expect(suggestion).toMatchObject({ counterpartyName: 'Stadtwerke Muster GmbH', bookingCount: 2, basis: 'name', description: 'Mandatsreferenz ist „MANDAT-0002“' })

    expect(await linkContract(contract.id, suggestion?.draft ?? { field: 'purpose', matchType: 'equals', pattern: '' }, NOW)).toBe(2)
    const linked = await bookingsOf('Stadtwerke Muster GmbH')
    expect(linked.every((entry) => entry.contractId === contract.id && entry.categoryId === 'electricity' && entry.categorySource === 'contract')).toBe(true)

    const after = await getContractBookings(contract, NOW)
    expect(after.suggestions).toEqual([])
    expect(after.rules.map((entry) => entry.description)).toEqual(['Mandatsreferenz ist „MANDAT-0002“'])
    expect(after.comparison.bookings.map((entry) => entry.amount)).toEqual([-85.33, -52.65])
    expect((await listRules()).map((entry) => entry.target)).toEqual(['Vertrag Stadtwerke'])

    await updateContract(contract.id, { ...POWER, categoryId: 'heating' })
    expect((await bookingsOf('Stadtwerke Muster GmbH')).every((entry) => entry.categoryId === 'heating')).toBe(true)
  })

  it('links bookings of the next import through the rule', async () => {
    const contract = await createContract(POWER)
    await linkContract(contract.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0002' }, NOW)
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    expect((await bookingsOf('Stadtwerke Muster GmbH')).every((entry) => entry.contractId === contract.id)).toBe(true)
  })

  it('keeps a manual category but still links the booking', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const contract = await createContract(POWER)
    const [first] = await bookingsOf('Stadtwerke Muster GmbH')
    await setTransactionAssignment(first?.id ?? '', { kind: 'category', categoryId: 'housing' })
    await linkContract(contract.id, { field: 'creditorId', matchType: 'equals', pattern: 'DE00ZZZ00000000002' }, NOW)
    expect(await transactionRepository.getById(first?.id ?? '')).toMatchObject({ contractId: contract.id, categoryId: 'housing', categorySource: 'manual' })
  })

  it('writes nothing to the sync queue - links stay on this device', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const contract = await createContract(POWER)
    const db = await getDatabase()
    const queueBefore = await db.getAll(STORE_NAMES.syncQueue)
    await linkContract(contract.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0002' }, NOW)
    expect(await db.getAll(STORE_NAMES.syncQueue)).toEqual(queueBefore)
    expect(await db.get(STORE_NAMES.contracts, contract.id)).not.toHaveProperty('transactionIds')
  })

  it('refuses a deleted contract and an empty pattern', async () => {
    const contract = await createContract(POWER)
    await expect(linkContract(contract.id, { field: 'counterpartyName', matchType: 'equals', pattern: ' ' })).rejects.toThrow('Bitte gib an')
    await deleteContract(contract.id)
    await expect(linkContract(contract.id, { field: 'counterpartyName', matchType: 'equals', pattern: 'X' })).rejects.toThrow('nicht mehr')
  })
})

describe('unlinking and deleting', () => {
  it('unlinking removes rule and links and categorizes the bookings again', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const contract = await createContract(POWER)
    const originalCategories = (await bookingsOf('Stadtwerke Muster GmbH')).map((entry) => [entry.id, entry.categoryId, entry.categorySource])
    await linkContract(contract.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0002' }, NOW)

    await unlinkContract(contract.id, NOW)
    expect(await categoryRuleRepository.getAll()).toEqual([])
    const after = await bookingsOf('Stadtwerke Muster GmbH')
    expect(after.some((entry) => 'contractId' in entry)).toBe(false)
    expect(after.map((entry) => [entry.id, entry.categoryId, entry.categorySource])).toEqual(originalCategories)
  })

  it('a deleted contract leaves a dangling link and the bookings fall back to the other rules', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const contract = await createContract(POWER)
    await linkContract(contract.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0002' }, NOW)
    await deleteContract(contract.id)

    const after = await bookingsOf('Stadtwerke Muster GmbH')
    expect(after.every((entry) => entry.contractId === contract.id && entry.categorySource !== 'contract')).toBe(true)
    expect((await listRules()).map((entry) => entry.target)).toEqual(['Vertrag nicht mehr vorhanden'])
  })
})

describe('fixed cost overview from real imports', () => {
  it('compares Soll and Ist for the newest fully imported month', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const power = await createContract(POWER)
    const phone = await createContract({ ...POWER, provider: 'Telekom', categoryId: 'telecom', monthlyCost: 14.47 })
    await linkContract(phone.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0007' }, NOW)

    const data = await getFixedCostData(NOW)
    // The sample runs to 22.09.2026, so August is the newest complete month.
    expect(data.defaultMonth).toBe('2026-08')
    const september = fixedCostOverviewFor(data, '2026-09')
    expect(september.rows.map((row) => [row.contract.id, row.status, row.actual])).toEqual([
      [power.id, 'unlinked', 0],
      [phone.id, 'ok', 14.47],
    ])
    expect(september).toMatchObject({ expectedTotal: 99.8, actualTotal: 14.47, monthCovered: false })
  })
})

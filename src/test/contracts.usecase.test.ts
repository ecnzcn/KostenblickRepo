import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import type { Contract } from '../domain/models/entities'
import {
  calculateRunningContractCosts,
  createContract,
  deleteContract,
  getContract,
  isContractActive,
  listContracts,
  updateContract,
  validateContractInput,
  type ContractInput,
} from '../domain/usecases/contracts'

beforeEach(async () => {
  await deleteDatabase()
})

const baseInput = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  categoryId: 'internet',
  provider: 'Telekom',
  tariff: 'MagentaZuhause L',
  monthlyCost: 49.99,
  startDate: '2025-01-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  cancellationPeriodValue: 3,
  cancellationPeriodUnit: 'months',
  autoRenewal: true,
  reminderEnabled: true,
  ...overrides,
})

describe('validateContractInput', () => {
  it('accepts valid input', () => {
    expect(validateContractInput(baseInput())).toEqual([])
  })

  it('requires a provider', () => {
    expect(validateContractInput(baseInput({ provider: '  ' }))).toContain('Anbieter darf nicht leer sein.')
  })

  it('rejects an end date before the start date', () => {
    expect(
      validateContractInput(baseInput({ startDate: '2026-06-01', endDate: '2026-01-01' })),
    ).toContain('Vertragsende darf nicht vor Vertragsbeginn liegen.')
  })
})

describe('createContract', () => {
  it('persists the contract, computing yearlyCost and the cancellation date', async () => {
    const created = await createContract(baseInput())

    expect(created.yearlyCost).toBe(599.88)
    expect(created.calculatedCancellationDate).toBe('2026-09-30T00:00:00.000Z')

    const reloaded = await getContract(created.id)
    expect(reloaded?.provider).toBe('Telekom')
  })

  it('keeps an explicitly provided yearlyCost instead of overriding it', async () => {
    const created = await createContract(baseInput({ monthlyCost: 50, yearlyCost: 550 }))
    expect(created.yearlyCost).toBe(550)
  })

  it('leaves calculatedCancellationDate unset without a full endDate/period/unit', async () => {
    const created = await createContract(
      baseInput({ endDate: undefined, cancellationPeriodValue: undefined, cancellationPeriodUnit: undefined }),
    )
    expect(created.calculatedCancellationDate).toBeUndefined()
  })

  it('rejects invalid input without touching the database', async () => {
    await expect(createContract(baseInput({ provider: '' }))).rejects.toThrow()
    expect(await listContracts()).toHaveLength(0)
  })
})

describe('updateContract', () => {
  it('updates fields and recomputes the cancellation date', async () => {
    const created = await createContract(baseInput())

    const updated = await updateContract(created.id, baseInput({ cancellationPeriodValue: 1 }))

    expect(updated.id).toBe(created.id)
    expect(updated.cancellationPeriodValue).toBe(1)
    expect(updated.calculatedCancellationDate).toBe('2026-11-30T00:00:00.000Z')
    expect(await listContracts()).toHaveLength(1)
  })

  it('throws when the contract does not exist', async () => {
    await expect(updateContract('missing', baseInput())).rejects.toThrow('nicht gefunden')
  })
})

describe('deleteContract', () => {
  it('soft-deletes the contract', async () => {
    const created = await createContract(baseInput())
    await deleteContract(created.id)
    expect(await listContracts()).toHaveLength(0)
  })
})

const referenceDate = new Date('2026-06-15T00:00:00.000Z')

const contractFixture = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'c1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 1,
  userId: 'u1',
  categoryId: 'internet',
  provider: 'Telekom',
  monthlyCost: 40,
  startDate: '2025-01-01T00:00:00.000Z',
  autoRenewal: false,
  reminderEnabled: false,
  ...overrides,
})

describe('isContractActive', () => {
  it('is active when it started in the past and has no end date', () => {
    expect(isContractActive(contractFixture(), referenceDate)).toBe(true)
  })

  it('is active when the end date is today', () => {
    expect(isContractActive(contractFixture({ endDate: '2026-06-15T00:00:00.000Z' }), referenceDate)).toBe(true)
  })

  it('is active when the end date is in the future', () => {
    expect(isContractActive(contractFixture({ endDate: '2026-12-31T00:00:00.000Z' }), referenceDate)).toBe(true)
  })

  it('is not active once the end date has passed', () => {
    expect(isContractActive(contractFixture({ endDate: '2026-06-14T00:00:00.000Z' }), referenceDate)).toBe(false)
  })

  it('is not active when the contract has not started yet', () => {
    expect(isContractActive(contractFixture({ startDate: '2026-06-16T00:00:00.000Z' }), referenceDate)).toBe(false)
  })

  it('is active when the contract starts today', () => {
    expect(isContractActive(contractFixture({ startDate: '2026-06-15T00:00:00.000Z' }), referenceDate)).toBe(true)
  })
})

describe('calculateRunningContractCosts', () => {
  it('sums monthlyCost/yearlyCost across active contracts only', () => {
    const active1 = contractFixture({ id: 'a1', monthlyCost: 40, yearlyCost: 480 })
    const active2 = contractFixture({ id: 'a2', monthlyCost: 89.9 })
    const future = contractFixture({ id: 'f1', monthlyCost: 999, startDate: '2027-01-01T00:00:00.000Z' })
    const expired = contractFixture({ id: 'e1', monthlyCost: 999, endDate: '2026-01-01T00:00:00.000Z' })

    const result = calculateRunningContractCosts([active1, active2, future, expired], referenceDate)

    expect(result.monthly).toBe(129.9)
  })

  it('falls back to monthlyCost * 12 when yearlyCost is not set', () => {
    const contract = contractFixture({ monthlyCost: 40 })
    const result = calculateRunningContractCosts([contract], referenceDate)
    expect(result.yearly).toBe(480)
  })

  it('uses the explicit yearlyCost when set, instead of monthlyCost * 12', () => {
    const contract = contractFixture({ monthlyCost: 40, yearlyCost: 450 })
    const result = calculateRunningContractCosts([contract], referenceDate)
    expect(result.yearly).toBe(450)
  })

  it('returns zero for no contracts', () => {
    expect(calculateRunningContractCosts([], referenceDate)).toEqual({ monthly: 0, yearly: 0 })
  })

  it('returns zero when every contract is expired or in the future', () => {
    const expired = contractFixture({ monthlyCost: 40, endDate: '2020-01-01T00:00:00.000Z' })
    const future = contractFixture({ monthlyCost: 40, startDate: '2030-01-01T00:00:00.000Z' })
    expect(calculateRunningContractCosts([expired, future], referenceDate)).toEqual({ monthly: 0, yearly: 0 })
  })
})

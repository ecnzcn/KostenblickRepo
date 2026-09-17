import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import {
  createContract,
  deleteContract,
  getContract,
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

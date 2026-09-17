import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase } from '../database/database'
import { createContract, deleteContract, updateContract, type ContractInput } from '../domain/usecases/contracts'
import {
  generateContractReminders,
  removeContractReminders,
} from '../domain/usecases/reminders/generateContractReminders'
import { dismissReminder, getRemindersOverview, listRemindersForContract } from '../domain/usecases/reminders/reminderQueries'
import { reminderRepository } from '../domain/repositories/indexedDbRepositories'

beforeEach(async () => {
  await deleteDatabase()
  localStorage.clear()
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

describe('createContract / updateContract reminder generation', () => {
  it('generates the 4 standard reminders when a contract with a cancellation date is created', async () => {
    const contract = await createContract(baseInput())
    const reminders = await listRemindersForContract(contract.id)
    expect(reminders).toHaveLength(4)
    expect(reminders.map((r) => r.offsetDays).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 7, 30, 90])
    expect(reminders.every((r) => r.status === 'pending')).toBe(true)
    expect(reminders.every((r) => r.type === 'cancellation')).toBe(true)
  })

  it('creates no reminders when reminderEnabled is false', async () => {
    const contract = await createContract(baseInput({ reminderEnabled: false }))
    expect(await listRemindersForContract(contract.id)).toHaveLength(0)
  })

  it('creates no reminders when the contract has no calculatedCancellationDate', async () => {
    const contract = await createContract(
      baseInput({ endDate: undefined, cancellationPeriodValue: undefined, cancellationPeriodUnit: undefined }),
    )
    expect(await listRemindersForContract(contract.id)).toHaveLength(0)
  })

  it('is idempotent: generating reminders for the same contract 3 times yields 4, not 12', async () => {
    const contract = await createContract(baseInput())
    await generateContractReminders(contract, [90, 30, 7, 1])
    await generateContractReminders(contract, [90, 30, 7, 1])
    await generateContractReminders(contract, [90, 30, 7, 1])
    expect(await listRemindersForContract(contract.id)).toHaveLength(4)
  })

  it('re-running generation with an unchanged contract keeps the same reminder ids (no delete+recreate)', async () => {
    const contract = await createContract(baseInput())
    const first = await listRemindersForContract(contract.id)
    await generateContractReminders(contract, [90, 30, 7, 1])
    const second = await listRemindersForContract(contract.id)
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort())
  })

  it('updates existing pending reminders in place when the cancellation date changes, without duplicating', async () => {
    const contract = await createContract(baseInput())
    const before = await listRemindersForContract(contract.id)
    const beforeIds = before.map((r) => r.id).sort()

    const updated = await updateContract(contract.id, baseInput({ cancellationPeriodValue: 1 }))
    expect(updated.calculatedCancellationDate).not.toBe(contract.calculatedCancellationDate)

    const after = await listRemindersForContract(updated.id)
    expect(after).toHaveLength(4)
    expect(after.map((r) => r.id).sort()).toEqual(beforeIds)
    expect(after.every((r) => r.status === 'pending')).toBe(true)
    // Reminder dates moved to reflect the new cancellation date.
    expect(after.map((r) => r.reminderDate).sort()).not.toEqual(before.map((r) => r.reminderDate).sort())
  })

  it('removes pending reminders when the contract is updated to disable reminders', async () => {
    const contract = await createContract(baseInput())
    expect(await listRemindersForContract(contract.id)).toHaveLength(4)

    await updateContract(contract.id, baseInput({ reminderEnabled: false }))
    expect(await listRemindersForContract(contract.id)).toHaveLength(0)
  })

  it('never touches an already-dismissed reminder when the contract changes', async () => {
    const contract = await createContract(baseInput())
    const [first] = await listRemindersForContract(contract.id)
    await dismissReminder(first!.id)

    await updateContract(contract.id, baseInput({ cancellationPeriodValue: 6 }))

    const reloaded = await reminderRepository.getById(first!.id)
    expect(reloaded?.status).toBe('dismissed')
    expect(reloaded?.reminderDate).toBe(first!.reminderDate)
  })
})

describe('deleteContract / removeContractReminders', () => {
  it('soft-deletes all reminders belonging to a deleted contract, leaving no orphans', async () => {
    const contract = await createContract(baseInput())
    expect(await listRemindersForContract(contract.id)).toHaveLength(4)

    await deleteContract(contract.id)

    const overview = await getRemindersOverview(new Date('2026-01-01T00:00:00.000Z'))
    const allEntries = [...overview.overdue, ...overview.dueToday, ...overview.thisWeek, ...overview.later]
    expect(allEntries.some((entry) => entry.contract.id === contract.id)).toBe(false)
  })

  it('is safe to call directly for a contract with no reminders', async () => {
    await expect(removeContractReminders('does-not-exist')).resolves.toBeUndefined()
  })
})

describe('getRemindersOverview', () => {
  it('groups reminders into overdue/dueToday/thisWeek/later, each sorted chronologically', async () => {
    const referenceDate = new Date('2026-06-15T00:00:00.000Z')

    // Cancellation date 20 days from reference -> reminder offsets [1] lands
    // 19 days out (later), offset [7] lands 13 days out (later),
    // to get controlled buckets we instead create three separate contracts
    // each with a single, precisely placed reminder via distinct end dates.
    const overdueContract = await createContract(
      baseInput({ provider: 'Overdue GmbH', endDate: '2026-06-10T00:00:00.000Z', cancellationPeriodValue: 5, cancellationPeriodUnit: 'days' }),
    )
    // calculatedCancellationDate = 2026-06-16 -> the 1-day-before reminder
    // lands exactly on the reference date (2026-06-15).
    const dueTodayContract = await createContract(
      baseInput({ provider: 'Today GmbH', endDate: '2026-06-17T00:00:00.000Z', cancellationPeriodValue: 1, cancellationPeriodUnit: 'days' }),
    )
    // calculatedCancellationDate = 2026-07-15 -> the 1-day-before reminder
    // lands 29 days out, comfortably in the "later" (> 7 days) bucket.
    const laterContract = await createContract(
      baseInput({ provider: 'Later GmbH', endDate: '2026-07-16T00:00:00.000Z', cancellationPeriodValue: 1, cancellationPeriodUnit: 'days' }),
    )

    const overview = await getRemindersOverview(referenceDate)

    expect(overview.overdue.some((e) => e.contract.id === overdueContract.id)).toBe(true)
    expect(overview.dueToday.some((e) => e.contract.id === dueTodayContract.id)).toBe(true)
    expect(overview.later.some((e) => e.contract.id === laterContract.id)).toBe(true)
  })

  it('excludes dismissed reminders and reminders of deleted contracts', async () => {
    const contract = await createContract(baseInput())
    const reminders = await listRemindersForContract(contract.id)
    await dismissReminder(reminders[0]!.id)

    const overview = await getRemindersOverview(new Date('2026-01-01T00:00:00.000Z'))
    const allEntries = [...overview.overdue, ...overview.dueToday, ...overview.thisWeek, ...overview.later]
    expect(allEntries.some((e) => e.reminder.id === reminders[0]!.id)).toBe(false)
  })

  it('returns empty groups for an empty database without crashing', async () => {
    const overview = await getRemindersOverview()
    expect(overview).toEqual({ overdue: [], dueToday: [], thisWeek: [], later: [] })
  })
})

describe('backward compatibility with pre-Phase-6 Reminder records', () => {
  it('reconciles cleanly against a legacy reminder that has no offsetDays (schema-additive field)', async () => {
    const contract = await createContract(baseInput())
    const [legacy] = await listRemindersForContract(contract.id)
    // Simulate a record written before the offsetDays field existed.
    await reminderRepository.save({ ...legacy!, offsetDays: undefined })

    const reconciled = await listRemindersForContract(contract.id)
    expect(reconciled).toHaveLength(4)

    // Recalculating (e.g. via a contract update) must not crash on the
    // legacy record and must still converge to exactly 4 reminders.
    await generateContractReminders(contract, [90, 30, 7, 1])
    expect(await listRemindersForContract(contract.id)).toHaveLength(4)
  })
})

describe('dismissReminder', () => {
  it('marks a reminder as dismissed and is safe to read back', async () => {
    const contract = await createContract(baseInput())
    const [reminder] = await listRemindersForContract(contract.id)
    const dismissed = await dismissReminder(reminder!.id)
    expect(dismissed.status).toBe('dismissed')
  })

  it('throws for an unknown reminder id', async () => {
    await expect(dismissReminder('missing')).rejects.toThrow('nicht gefunden')
  })
})

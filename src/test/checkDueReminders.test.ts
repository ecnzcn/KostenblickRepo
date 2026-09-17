import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDatabase } from '../database/database'
import { createContract, type ContractInput } from '../domain/usecases/contracts'
import { notifyDueReminders } from '../domain/usecases/reminders/checkDueReminders'
import { listRemindersForContract } from '../domain/usecases/reminders/reminderQueries'
import { saveReminderIntervalSettings } from '../domain/usecases/reminders/reminderSettings'
import type { NotificationService } from '../services/notifications/NotificationService'

beforeEach(async () => {
  await deleteDatabase()
  localStorage.clear()
})

const baseInput = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  categoryId: 'internet',
  provider: 'Telekom',
  monthlyCost: 40,
  startDate: '2025-01-01T00:00:00.000Z',
  endDate: '2026-06-17T00:00:00.000Z',
  cancellationPeriodValue: 1,
  cancellationPeriodUnit: 'days',
  autoRenewal: false,
  reminderEnabled: true,
  ...overrides,
})

function fakeNotificationService(overrides: Partial<NotificationService> = {}): NotificationService {
  return {
    isSupported: () => true,
    getPermissionStatus: () => 'granted',
    requestPermission: async () => 'granted',
    notify: vi.fn(),
    ...overrides,
  }
}

describe('notifyDueReminders', () => {
  it('does nothing when permission is not granted', async () => {
    await createContract(baseInput())
    const service = fakeNotificationService({ getPermissionStatus: () => 'default' })
    const count = await notifyDueReminders(new Date('2026-06-15T00:00:00.000Z'), service)
    expect(count).toBe(0)
    expect(service.notify).not.toHaveBeenCalled()
  })

  it('does nothing when unsupported', async () => {
    await createContract(baseInput())
    const service = fakeNotificationService({ isSupported: () => false, getPermissionStatus: () => 'granted' })
    const count = await notifyDueReminders(new Date('2026-06-15T00:00:00.000Z'), service)
    expect(count).toBe(0)
  })

  it('notifies for a reminder due today and marks it sent (never re-notifies on a second run)', async () => {
    // Only the 1-day interval enabled, so exactly one reminder exists.
    // calculatedCancellationDate = 2026-06-16 -> it lands exactly on the
    // reference date.
    saveReminderIntervalSettings({ 90: false, 30: false, 7: false, 1: true })
    const contract = await createContract(baseInput())
    const referenceDate = new Date('2026-06-15T00:00:00.000Z')
    const service = fakeNotificationService()

    const firstCount = await notifyDueReminders(referenceDate, service)
    expect(firstCount).toBe(1)
    expect(service.notify).toHaveBeenCalledTimes(1)

    const reminders = await listRemindersForContract(contract.id)
    expect(reminders.find((r) => r.offsetDays === 1)?.status).toBe('sent')

    const secondCount = await notifyDueReminders(referenceDate, service)
    expect(secondCount).toBe(0)
    expect(service.notify).toHaveBeenCalledTimes(1)
  })

  it('does not notify for reminders that are still in the future', async () => {
    // calculatedCancellationDate = 2026-10-01, ~108 days out - beyond even
    // the largest (90-day) default reminder offset.
    await createContract(baseInput({ endDate: '2026-10-02T00:00:00.000Z', cancellationPeriodValue: 1, cancellationPeriodUnit: 'days' }))
    const service = fakeNotificationService()
    const count = await notifyDueReminders(new Date('2026-06-15T00:00:00.000Z'), service)
    expect(count).toBe(0)
    expect(service.notify).not.toHaveBeenCalled()
  })
})

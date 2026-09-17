import { DEFAULT_USER_ID } from '../../../constants/user'
import { generateId } from '../../../utils/id'
import type { Contract, Reminder } from '../../models/entities'
import { reminderRepository } from '../../repositories/indexedDbRepositories'
import { calculateReminderDates, DEFAULT_REMINDER_OFFSET_DAYS, type ReminderDateEntry } from './calculateReminderDates'
import { listRemindersForContract } from './reminderQueries'

/**
 * Recomputes a contract's cancellation reminders and reconciles them
 * against what's already stored, so calling this repeatedly (on every
 * create/update) is idempotent - never a duplicate reminder, per contract
 * per offset:
 *
 * - A pending/sent reminder whose offset is still wanted and whose date
 *   hasn't changed is left untouched.
 * - A pending/sent reminder whose offset is still wanted but whose date
 *   *has* changed (the contract's end date/cancellation period changed)
 *   is updated in place (same id, new date, status reset to 'pending') -
 *   never deleted-and-recreated, so its identity/history is preserved.
 * - A pending/sent reminder whose offset is no longer wanted (interval
 *   disabled in Settings, or the contract no longer has a cancellation
 *   date / reminders turned off) is soft-deleted.
 * - An already-dismissed ("erledigt") reminder is historical and is never
 *   touched by recalculation, regardless of whether its offset is still
 *   wanted.
 * - A missing wanted offset gets a freshly created reminder.
 */
export async function generateContractReminders(
  contract: Contract,
  offsets: readonly number[] = DEFAULT_REMINDER_OFFSET_DAYS,
): Promise<Reminder[]> {
  const wanted =
    contract.reminderEnabled && contract.calculatedCancellationDate
      ? calculateReminderDates(contract.calculatedCancellationDate, offsets)
      : []

  return reconcileReminders(contract, wanted)
}

async function reconcileReminders(contract: Contract, wanted: ReminderDateEntry[]): Promise<Reminder[]> {
  const existing = await listRemindersForContract(contract.id)
  const wantedByOffset = new Map(wanted.map((entry) => [entry.offsetDays, entry]))
  const satisfiedOffsets = new Set<number>()
  const now = new Date().toISOString()

  const result: Reminder[] = []

  for (const reminder of existing) {
    if (reminder.type !== 'cancellation' || reminder.status === 'dismissed') {
      result.push(reminder)
      continue
    }

    const want = reminder.offsetDays !== undefined ? wantedByOffset.get(reminder.offsetDays) : undefined
    if (!want) {
      await reminderRepository.delete(reminder.id)
      continue
    }

    satisfiedOffsets.add(want.offsetDays)
    if (want.reminderDate === reminder.reminderDate) {
      result.push(reminder)
      continue
    }

    result.push(await reminderRepository.save({ ...reminder, reminderDate: want.reminderDate, status: 'pending' }))
  }

  for (const entry of wanted) {
    if (satisfiedOffsets.has(entry.offsetDays)) continue
    result.push(
      await reminderRepository.save({
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncVersion: 1,
        userId: contract.userId ?? DEFAULT_USER_ID,
        contractId: contract.id,
        reminderDate: entry.reminderDate,
        type: 'cancellation',
        status: 'pending',
        offsetDays: entry.offsetDays,
      }),
    )
  }

  return result
}

/** Soft-deletes every reminder tied to a contract - called when the
 * contract itself is deleted, so no orphaned reminder can surface on
 * /erinnerungen (getRemindersOverview also defensively skips reminders
 * whose contract no longer exists, but this keeps the reminders store
 * itself clean rather than relying solely on that filter). */
export async function removeContractReminders(contractId: string): Promise<void> {
  const reminders = await listRemindersForContract(contractId)
  for (const reminder of reminders) {
    await reminderRepository.delete(reminder.id)
  }
}

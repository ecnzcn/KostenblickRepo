import { categoryRepository } from '../../repositories/categories'
import { contractRepository, reminderRepository } from '../../repositories/indexedDbRepositories'
import type { Category, Contract, Reminder } from '../../models/entities'
import { daysUntil } from '../../../utils/date'

export type ReminderDisplayStatus = 'overdue' | 'due' | 'upcoming' | 'completed'

/** Derived, UI-facing status - distinct from the persisted `Reminder.status`
 * (pending/sent/dismissed), which only tracks the reminder's own
 * lifecycle. This is never duplicated in a component: any screen showing
 * "overdue"/"due"/"upcoming"/"completed" calls this. */
export function getReminderDisplayStatus(reminder: Reminder, referenceDate: Date = new Date()): ReminderDisplayStatus {
  if (reminder.status === 'dismissed') return 'completed'
  const days = daysUntil(reminder.reminderDate, referenceDate)
  if (days < 0) return 'overdue'
  if (days === 0) return 'due'
  return 'upcoming'
}

/** All reminders (any status) belonging to one contract, oldest first.
 * IndexedDBRepository has no per-field query, so - matching the existing
 * `listBillItems` pattern in domain/usecases/bills.ts - this loads every
 * reminder and filters in memory; reminder counts are small (a handful
 * per contract). */
export async function listRemindersForContract(contractId: string): Promise<Reminder[]> {
  const all = await reminderRepository.getAll()
  return all
    .filter((reminder) => reminder.contractId === contractId)
    .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime())
}

export interface ReminderListEntry {
  reminder: Reminder
  contract: Contract
  categoryName: string
  categoryIcon: string
  displayStatus: ReminderDisplayStatus
}

export interface RemindersOverview {
  overdue: ReminderListEntry[]
  dueToday: ReminderListEntry[]
  thisWeek: ReminderListEntry[]
  later: ReminderListEntry[]
}

function byDateAscending(a: ReminderListEntry, b: ReminderListEntry): number {
  return new Date(a.reminder.reminderDate).getTime() - new Date(b.reminder.reminderDate).getTime()
}

/**
 * Loads Reminders, Contracts and Categories once and joins/groups them for
 * the /erinnerungen page and the Dashboard's "Nächste Vertragsfristen"
 * card - a single pass, not a query per row. Only active (non-dismissed)
 * reminders whose contract still exists (not soft-deleted) are included,
 * grouped as: overdue, due today, within the next 7 days, later - each
 * group sorted chronologically, matching the required page layout.
 */
export async function getRemindersOverview(referenceDate: Date = new Date()): Promise<RemindersOverview> {
  const [reminders, contracts, categories] = await Promise.all([
    reminderRepository.getAll(),
    contractRepository.getAll(),
    categoryRepository.getAll(),
  ])

  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]))
  const categoriesById = new Map<string, Category>(categories.map((category) => [category.id, category]))

  const overview: RemindersOverview = { overdue: [], dueToday: [], thisWeek: [], later: [] }

  for (const reminder of reminders) {
    if (reminder.status === 'dismissed') continue
    if (!reminder.contractId) continue
    const contract = contractsById.get(reminder.contractId)
    if (!contract) continue // gelöschter/verwaister Vertrag - Reminder wird nicht angezeigt

    const category = categoriesById.get(contract.categoryId)
    const entry: ReminderListEntry = {
      reminder,
      contract,
      categoryName: category?.name ?? contract.provider,
      categoryIcon: category?.icon ?? '•',
      displayStatus: getReminderDisplayStatus(reminder, referenceDate),
    }

    const days = daysUntil(reminder.reminderDate, referenceDate)
    if (days < 0) overview.overdue.push(entry)
    else if (days === 0) overview.dueToday.push(entry)
    else if (days <= 7) overview.thisWeek.push(entry)
    else overview.later.push(entry)
  }

  overview.overdue.sort(byDateAscending)
  overview.dueToday.sort(byDateAscending)
  overview.thisWeek.sort(byDateAscending)
  overview.later.sort(byDateAscending)

  return overview
}

/** Marks a reminder as done - a reminder can only ever be completed once
 * (re-dismissing an already-dismissed reminder is a no-op via the
 * repository's own save/soft-delete semantics; the UI also only offers
 * the action while a reminder isn't already completed). */
export async function dismissReminder(id: string): Promise<Reminder> {
  const existing = await reminderRepository.getById(id)
  if (!existing) throw new Error('Erinnerung wurde nicht gefunden.')
  return reminderRepository.save({ ...existing, status: 'dismissed' })
}

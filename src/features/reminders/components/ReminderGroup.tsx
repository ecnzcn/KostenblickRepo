import { ReminderListItem } from './ReminderListItem'
import type { ReminderListEntry } from '../reminders.types'

interface ReminderGroupProps {
  title: string
  entries: ReminderListEntry[]
  onDismiss: (id: string) => void
}

export function ReminderGroup({ title, entries, onDismiss }: ReminderGroupProps) {
  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <ReminderListItem key={entry.reminder.id} entry={entry} onDismiss={onDismiss} />
        ))}
      </ul>
    </section>
  )
}

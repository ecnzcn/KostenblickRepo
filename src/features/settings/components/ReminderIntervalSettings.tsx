import { useState } from 'react'
import { CheckboxField } from '../../../components/form/fields'
import { DEFAULT_REMINDER_OFFSET_DAYS } from '../../../domain/usecases/reminders/calculateReminderDates'
import {
  getReminderIntervalSettings,
  saveReminderIntervalSettings,
  type ReminderIntervalSettings as ReminderIntervalSettingsValue,
} from '../../../domain/usecases/reminders/reminderSettings'

const INTERVAL_LABELS: Record<number, string> = {
  90: '90 Tage vorher',
  30: '30 Tage vorher',
  7: '7 Tage vorher',
  1: '1 Tag vorher',
}

/** Lets the user enable/disable the standard reminder lead times used by
 * generateContractReminders for every contract - not a per-contract
 * setting in Phase 6, per scope. */
export function ReminderIntervalSettings() {
  const [settings, setSettings] = useState<ReminderIntervalSettingsValue>(() => getReminderIntervalSettings())

  function toggle(offsetDays: number, enabled: boolean) {
    const next = { ...settings, [offsetDays]: enabled }
    setSettings(next)
    saveReminderIntervalSettings(next)
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Vertragserinnerungen</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Wann vor der Kündigungsfrist eines Vertrags erinnert werden soll.
      </p>
      <div className="mt-3 flex flex-col">
        {DEFAULT_REMINDER_OFFSET_DAYS.map((offsetDays) => (
          <CheckboxField
            key={offsetDays}
            id={`reminder-interval-${offsetDays}`}
            label={INTERVAL_LABELS[offsetDays] ?? `${offsetDays} Tage vorher`}
            checked={settings[offsetDays] !== false}
            onChange={(checked) => toggle(offsetDays, checked)}
          />
        ))}
      </div>
    </section>
  )
}

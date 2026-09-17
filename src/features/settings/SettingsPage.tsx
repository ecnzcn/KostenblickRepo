import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { ROUTES } from '../../constants/navigation'
import { NotificationSettings } from './components/NotificationSettings'
import { ReminderIntervalSettings } from './components/ReminderIntervalSettings'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Mehr" subtitle="Einstellungen und weitere Bereiche" />
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <li className="px-4 py-3 text-sm text-neutral-700">Dokumente</li>
          <li className="px-4 py-3 text-sm text-neutral-700">Müllkosten</li>
          <li>
            <Link to={ROUTES.reminders} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Erinnerungen
            </Link>
          </li>
          <li className="px-4 py-3 text-sm text-neutral-700">Synchronisierung</li>
        </ul>

        <ReminderIntervalSettings />
        <NotificationSettings />
      </div>
    </>
  )
}

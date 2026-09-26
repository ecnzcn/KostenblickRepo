import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/layout/PageHeader'
import { APP_VERSION } from '../../constants/appVersion'
import { ROUTES } from '../../constants/navigation'
import { BackupSettings } from './components/BackupSettings'
import { NotificationSettings } from './components/NotificationSettings'
import { ReminderIntervalSettings } from './components/ReminderIntervalSettings'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Mehr" subtitle="Einstellungen und weitere Bereiche" />
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <li>
            <Link to={ROUTES.costOverview} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Kostenübersicht
            </Link>
          </li>
          <li>
            <Link to={ROUTES.documents} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Dokumente
            </Link>
          </li>
          <li>
            <Link to={ROUTES.waste} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Müllkosten
            </Link>
          </li>
          <li>
            <Link to={ROUTES.reminders} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Erinnerungen
            </Link>
          </li>
          <li>
            <Link to={ROUTES.costs} className="block min-h-11 px-4 py-3 text-sm font-medium text-accent">
              Kosten
            </Link>
          </li>
        </ul>

        <ReminderIntervalSettings />
        <NotificationSettings />
        <BackupSettings />

        <p className="text-center text-xs text-neutral-400">Version {APP_VERSION}</p>
      </div>
    </>
  )
}

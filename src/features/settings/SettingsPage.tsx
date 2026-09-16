import { PageHeader } from '../../components/layout/PageHeader'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Mehr" subtitle="Einstellungen und weitere Bereiche" />
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <li className="px-4 py-3 text-sm text-neutral-700">Dokumente</li>
        <li className="px-4 py-3 text-sm text-neutral-700">Müllkosten</li>
        <li className="px-4 py-3 text-sm text-neutral-700">Erinnerungen</li>
        <li className="px-4 py-3 text-sm text-neutral-700">Synchronisierung</li>
      </ul>
    </>
  )
}

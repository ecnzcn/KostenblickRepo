import { formatMonthYear } from '../../../utils/formatters'

function getGreeting(hour: number): string {
  if (hour < 12) return 'Guten Morgen'
  if (hour < 18) return 'Guten Tag'
  return 'Guten Abend'
}

interface DashboardHeaderProps {
  userDisplayName?: string
  referenceDate: Date
}

export function DashboardHeader({ userDisplayName, referenceDate }: DashboardHeaderProps) {
  const greeting = getGreeting(referenceDate.getHours())

  return (
    <header className="mb-6">
      <p className="text-sm font-medium text-neutral-500">
        {greeting}
        {userDisplayName ? `, ${userDisplayName}` : ''}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 lg:text-4xl">Kostenblick</h1>
      <p className="mt-1 text-sm text-neutral-500">{formatMonthYear(referenceDate)}</p>
    </header>
  )
}

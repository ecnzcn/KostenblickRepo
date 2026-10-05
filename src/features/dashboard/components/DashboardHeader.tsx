import type { ReactNode } from 'react'

interface DashboardHeaderProps {
  userDisplayName?: string
  /** Shown to the right of the greeting, e.g. the month picker. */
  children?: ReactNode
}

export function DashboardHeader({ userDisplayName, children }: DashboardHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 lg:text-4xl">
          Hallo{userDisplayName ? `, ${userDisplayName}` : ''}!
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Hier ist dein aktueller Kostenblick.</p>
      </div>
      {children}
    </header>
  )
}

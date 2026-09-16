import type { PropsWithChildren } from 'react'
import { BottomNav } from './BottomNav'

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50">
      <main className="flex-1 px-4 pb-24 pt-6">{children}</main>
      <BottomNav />
    </div>
  )
}

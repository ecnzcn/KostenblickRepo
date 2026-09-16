import type { PropsWithChildren } from 'react'
import { BottomNav } from './BottomNav'
import { SidebarNav } from './SidebarNav'

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-dvh bg-neutral-50">
      <SidebarNav />
      <div className="flex flex-1 flex-col">
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6 md:max-w-2xl md:px-8 md:pt-10 lg:max-w-4xl lg:px-10 lg:pb-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  )
}

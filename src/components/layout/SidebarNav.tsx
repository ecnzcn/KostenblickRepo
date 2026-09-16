import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../constants/navigation'

export function SidebarNav() {
  return (
    <nav
      aria-label="Seitennavigation"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-8 lg:flex"
    >
      <span className="px-2 text-lg font-semibold tracking-tight text-neutral-900">
        Kostenblick
      </span>
      <ul className="mt-8 flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span aria-current={isActive ? 'page' : undefined}>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

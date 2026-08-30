import { Link, useLocation } from 'react-router'
import { useNavItems } from '@/app/navigation/useNavItems'

export function AppSidebar() {
  const items = useNavItems()
  const location = useLocation()

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 border-r border-border px-3 py-5 lg:block">
      <p className="px-3 pb-2 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">Menu</p>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors duration-150 ease-standard ${
                isActive
                  ? 'bg-brand-primary/15 text-brand-primary'
                  : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

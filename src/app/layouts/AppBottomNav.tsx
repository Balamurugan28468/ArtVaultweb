import { LogIn } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useNavItems } from '@/app/navigation/useNavItems'

export function AppBottomNav() {
  const { status } = useAuth()
  const items = useNavItems()
  const location = useLocation()

  return (
    <nav
      aria-label="Primary"
      className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
    >
      <div className="flex h-16 items-stretch justify-around">
        {items.map((item) => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-xs ${
                isActive ? 'text-brand-primary-on-dark' : 'text-text-secondary'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
        {status === 'unauthenticated' && (
          <Link
            to="/sign-in"
            className="flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-xs text-text-secondary"
          >
            <LogIn className="h-5 w-5" />
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}

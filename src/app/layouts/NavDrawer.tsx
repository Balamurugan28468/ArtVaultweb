import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useNavItems } from '@/app/navigation/useNavItems'
import { SignOutButton } from '@/features/auth'
import { Drawer, Skeleton, buttonClassName, dropdownItemClassName } from '@/shared/ui'

export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { status } = useAuth()
  const items = useNavItems()

  return (
    <Drawer open={open} onClose={onClose} title="Menu" side="left">
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {items.map((item) => (
          <Link key={item.id} to={item.href} onClick={onClose} className={dropdownItemClassName}>
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 border-t border-border pt-4">
        {/* Same real regression fix as AppTopBar: never render nothing at
            all while status is 'loading' — see that file's comment. */}
        {status === 'loading' && (
          <div aria-label="Loading account status" role="status" className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
          </div>
        )}
        {status === 'authenticated' ? (
          <SignOutButton onClick={onClose} className={`${dropdownItemClassName} justify-start`} />
        ) : (
          status === 'unauthenticated' && (
            <div className="flex flex-col gap-2">
              <Link to="/sign-in" onClick={onClose} className={buttonClassName('secondary', 'md')}>
                Sign in
              </Link>
              <Link to="/sign-up" onClick={onClose} className={buttonClassName('gold', 'md')}>
                Create Account
              </Link>
            </div>
          )
        )}
      </div>
    </Drawer>
  )
}

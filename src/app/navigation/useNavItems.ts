import { useAuth } from '@/app/providers/AuthProvider'
import { NAV_ITEMS, type NavAudience, type NavItem } from './navItems'

/**
 * Returns only the nav items that are both genuinely implemented
 * ('available') and relevant to the current viewer. Purely a UX/display
 * concern — every destination remains independently protected by
 * RequireAuth/route guards and Firestore rules regardless of what's
 * shown here (see docs/SECURITY.md).
 */
export function useNavItems(): NavItem[] {
  const { status, role } = useAuth()

  const audience: NavAudience = status === 'authenticated' && role ? role : 'guest'

  return NAV_ITEMS.filter((item) => item.status === 'available' && item.audiences.includes(audience))
}

import type { ReactNode } from 'react'
import { signOutUser } from '../api/authClient'

export function SignOutButton({
  className,
  onClick,
  children,
}: {
  className?: string
  onClick?: () => void
  children?: ReactNode
}) {
  const handleClick = async () => {
    try {
      await signOutUser()
      onClick?.()
    } catch (error) {
      console.error(
        'Supabase sign out failed:',
        error,
      )
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
    >
      {children ?? 'Sign out'}
    </button>
  )
}
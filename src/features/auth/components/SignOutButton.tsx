import type { ReactNode } from 'react'
import { signOutUser } from '../api/authClient'

export function SignOutButton({
  className,
  onClick,
  children,
}: {
  className?: string
  onClick?: () => void
  /** Optional custom content (e.g. an icon + label for a tile layout) — defaults to the plain "Sign out" text every existing caller already relies on. */
  children?: ReactNode
}) {
  const handleClick = async () => {
    try {
      await signOutUser()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
    onClick?.()
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children ?? 'Sign out'}
    </button>
  )
}

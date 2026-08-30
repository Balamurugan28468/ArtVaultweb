import { signOutUser } from '../api/authClient'

export function SignOutButton({ className, onClick }: { className?: string; onClick?: () => void }) {
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
      Sign out
    </button>
  )
}

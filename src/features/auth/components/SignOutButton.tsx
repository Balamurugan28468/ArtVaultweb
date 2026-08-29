import { signOutUser } from '../api/authClient'

export function SignOutButton({ className }: { className?: string }) {
  const handleClick = async () => {
    try {
      await signOutUser()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      Sign out
    </button>
  )
}

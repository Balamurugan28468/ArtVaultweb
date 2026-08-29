import { Link, useLocation, useNavigate } from 'react-router'
import { SignInForm } from '@/features/auth'

export function getRedirectPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const { from } = state as { from: unknown }
    if (typeof from === 'string') return from
  }
  return '/account'
}

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = getRedirectPath(location.state)

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <div className="mt-4">
        <SignInForm onSuccess={() => navigate(redirectTo, { replace: true })} />
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        No account? <Link to="/sign-up">Sign up</Link>
      </p>
    </section>
  )
}

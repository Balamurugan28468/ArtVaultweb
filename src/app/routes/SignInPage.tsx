import { Link, useLocation, useNavigate } from 'react-router'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { SignInForm } from '@/features/auth'
import { Card } from '@/shared/ui'

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
    <section className="relative mx-auto flex max-w-sm flex-col items-center py-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-primary/10 via-accent-gold/5 to-transparent blur-2xl"
      />
      <BrandLogo />
      <Card className="mt-6 w-full border-t-2 border-t-accent-gold/40 p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
        <div className="mt-4">
          <SignInForm onSuccess={() => navigate(redirectTo, { replace: true })} />
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          No account?{' '}
          <Link to="/sign-up" className="font-medium text-brand-primary">
            Sign up
          </Link>
        </p>
      </Card>
    </section>
  )
}

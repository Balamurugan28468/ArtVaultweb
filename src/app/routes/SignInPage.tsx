import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
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
  const { status } = useAuth()
  const [submitted, setSubmitted] = useState(false)
  const redirectTo = getRedirectPath(location.state)

  // Navigating only once AuthProvider itself reports "authenticated" (the
  // same status RequireAuth reads), not immediately once this form's own
  // signInWithEmail() call resolves — those are two independent
  // completions, and arriving at the destination before AuthProvider
  // catches up made RequireAuth bounce straight back to /sign-in even
  // though sign-in had genuinely succeeded.
  useEffect(() => {
    if (submitted && status === 'authenticated') {
      navigate(redirectTo, { replace: true })
    }
  }, [submitted, status, navigate, redirectTo])

  return (
    <section className="relative mx-auto flex max-w-sm flex-col items-center py-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-primary/10 via-accent-gold/5 to-transparent blur-2xl"
      />
      <BrandLogo />
      <Card className="mt-6 w-full border-t-2 border-t-accent-gold/40 p-4 sm:p-6">
        <h1 className="font-display text-2xl font-medium text-text-primary">Sign in</h1>
        <div className="mt-4">
          <SignInForm onSuccess={() => setSubmitted(true)} />
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          No account?{' '}
          <Link to="/sign-up" className="font-medium text-brand-primary-on-dark">
            Sign up
          </Link>
        </p>
      </Card>
    </section>
  )
}

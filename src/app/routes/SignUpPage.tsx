import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { SignUpForm } from '@/features/auth'
import { getRedirectPath } from '@/features/auth/returnTo'
import { Card } from '@/shared/ui'

export function SignUpPage() {
  const navigate = useNavigate()
  const redirectTo = getRedirectPath(useLocation().state)
  const { status } = useAuth()
  const [submitted, setSubmitted] = useState(false)

  // Navigating only once AuthProvider itself reports "authenticated" — the
  // same status RequireAuth reads — rather than immediately once this
  // form's own signUpWithEmail() call resolves, is what actually matters
  // here: those are two independent completions (this form's own promise vs.
  // AuthProvider's separate onAuthStateChanged-driven resolution), and
  // navigating on the wrong one is a real race — arriving at /account before
  // AuthProvider catches up made RequireAuth bounce straight back to
  // /sign-in, even though sign-up had genuinely succeeded.
  useEffect(() => {
    if (submitted && status === 'authenticated') {
      navigate(redirectTo, { replace: true })
    }
  }, [submitted, status, navigate, redirectTo])

  const handleSuccess = () => {
    setSubmitted(true)
  }

  return (
    <section className="relative mx-auto flex max-w-sm flex-col items-center py-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-primary/10 via-accent-gold/5 to-transparent blur-2xl"
      />
      <BrandLogo />
      <Card className="mt-6 w-full border-t-2 border-t-accent-gold/40 p-4 sm:p-6">
        <h1 className="font-display text-2xl font-medium text-text-primary">Create your account</h1>
        <div className="mt-4">
          <SignUpForm onSuccess={handleSuccess} />
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/sign-in" state={{ from: redirectTo }} className="font-medium text-brand-primary-on-dark">
            Sign in
          </Link>
        </p>
      </Card>
    </section>
  )
}

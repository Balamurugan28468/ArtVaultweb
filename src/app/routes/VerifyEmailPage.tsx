import { useLocation, useNavigate } from 'react-router'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { VerifyOtpForm } from '@/features/auth'
import { Card } from '@/shared/ui'
import { getRedirectPath } from '@/features/auth/returnTo'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const searchParams = new URLSearchParams(location.search)
  const email =
    (location.state?.email as string | undefined) ||
    searchParams.get('email') ||
    ''
  const redirectTo = getRedirectPath(location.state)

  const handleSuccess = () => {
    navigate('/sign-in', {
      replace: true,
      state: {
        verified: true,
        from: redirectTo,
      },
    })
  }

  return (
    <section className="relative mx-auto flex max-w-sm flex-col items-center py-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-primary/10 via-accent-gold/5 to-transparent blur-2xl"
      />
      <BrandLogo />
      <Card className="mt-6 w-full border-t-2 border-t-accent-gold/40 p-4 sm:p-6">
        <h1 className="font-display text-2xl font-medium text-text-primary">
          Verify your email
        </h1>
        <div className="mt-4">
          <VerifyOtpForm
            initialEmail={email}
            onSuccess={handleSuccess}
          />
        </div>
      </Card>
    </section>
  )
}


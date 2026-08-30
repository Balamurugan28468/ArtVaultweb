import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { SignUpForm } from '@/features/auth'
import { Card } from '@/shared/ui'

export function SignUpPage() {
  const navigate = useNavigate()
  const { refreshRole } = useAuth()

  const handleSuccess = async () => {
    await refreshRole()
    navigate('/account')
  }

  return (
    <section className="relative mx-auto flex max-w-sm flex-col items-center py-6 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-primary/10 via-accent-gold/5 to-transparent blur-2xl"
      />
      <BrandLogo />
      <Card className="mt-6 w-full border-t-2 border-t-accent-gold/40 p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-text-primary">Create your account</h1>
        <div className="mt-4">
          <SignUpForm onSuccess={handleSuccess} />
        </div>
        <p className="mt-4 text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-brand-primary">
            Sign in
          </Link>
        </p>
      </Card>
    </section>
  )
}

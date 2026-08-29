import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { SignUpForm } from '@/features/auth'

export function SignUpPage() {
  const navigate = useNavigate()
  const { refreshRole } = useAuth()

  const handleSuccess = async () => {
    await refreshRole()
    navigate('/account')
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <div className="mt-4">
        <SignUpForm onSuccess={handleSuccess} />
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </section>
  )
}

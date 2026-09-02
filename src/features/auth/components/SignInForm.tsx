import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, Input } from '@/shared/ui'
import { signInWithEmail } from '../api/authClient'
import { signInSchema, type SignInInput } from '../schemas'

export function SignInForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), mode: 'onTouched' })

  const onSubmit = async (values: SignInInput) => {
    setSubmitError(null)
    try {
      await signInWithEmail(values)
      await onSuccess()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-in-email" className="text-sm font-medium text-text-secondary">
          Email
        </label>
        <Input
          id="sign-in-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'sign-in-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <span id="sign-in-email-error" className="text-sm font-normal text-danger">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-in-password" className="text-sm font-medium text-text-secondary">
          Password
        </label>
        <Input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'sign-in-password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <span id="sign-in-password-error" className="text-sm font-normal text-danger">
            {errors.password.message}
          </span>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-danger">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

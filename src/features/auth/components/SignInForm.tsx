import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { signInWithEmail } from '../api/authClient'
import { signInSchema, type SignInInput } from '../schemas'

export function SignInForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) })

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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'sign-in-email-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('email')}
        />
        {errors.email && (
          <span id="sign-in-email-error" className="text-sm text-red-600">
            {errors.email.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'sign-in-password-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('password')}
        />
        {errors.password && (
          <span id="sign-in-password-error" className="text-sm text-red-600">
            {errors.password.message}
          </span>
        )}
      </label>

      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

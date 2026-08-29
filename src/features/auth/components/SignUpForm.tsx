import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { signUpWithEmail } from '../api/authClient'
import { signUpSchema, type SignUpInput } from '../schemas'

export function SignUpForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) })

  const onSubmit = async (values: SignUpInput) => {
    setSubmitError(null)
    try {
      await signUpWithEmail(values)
      await onSuccess()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'sign-up-name-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('displayName')}
        />
        {errors.displayName && (
          <span id="sign-up-name-error" className="text-sm text-red-600">
            {errors.displayName.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'sign-up-email-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('email')}
        />
        {errors.email && (
          <span id="sign-up-email-error" className="text-sm text-red-600">
            {errors.email.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'sign-up-password-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('password')}
        />
        {errors.password && (
          <span id="sign-up-password-error" className="text-sm text-red-600">
            {errors.password.message}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'sign-up-confirm-password-error' : undefined}
          className="rounded border border-neutral-300 px-3 py-2"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <span id="sign-up-confirm-password-error" className="text-sm text-red-600">
            {errors.confirmPassword.message}
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
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, Input } from '@/shared/ui'
import { signUpWithEmail } from '../api/authClient'
import { signUpSchema, type SignUpInput } from '../schemas'

export function SignUpForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), mode: 'onTouched' })

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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-up-name" className="text-sm font-medium text-text-secondary">
          Name
        </label>
        <Input
          id="sign-up-name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'sign-up-name-error' : undefined}
          {...register('displayName')}
        />
        {errors.displayName && (
          <span id="sign-up-name-error" className="text-sm font-normal text-danger">
            {errors.displayName.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-up-email" className="text-sm font-medium text-text-secondary">
          Email
        </label>
        <Input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'sign-up-email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <span id="sign-up-email-error" className="text-sm font-normal text-danger">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-up-password" className="text-sm font-medium text-text-secondary">
          Password
        </label>
        <Input
          id="sign-up-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'sign-up-password-error sign-up-password-hint' : 'sign-up-password-hint'}
          {...register('password')}
        />
        <span id="sign-up-password-hint" className="text-xs font-normal text-text-muted">
          At least 8 characters, with an uppercase letter, a lowercase letter, and a number.
        </span>
        {errors.password && (
          <span id="sign-up-password-error" className="text-sm font-normal text-danger">
            {errors.password.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sign-up-confirm-password" className="text-sm font-medium text-text-secondary">
          Confirm password
        </label>
        <Input
          id="sign-up-confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'sign-up-confirm-password-error' : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <span id="sign-up-confirm-password-error" className="text-sm font-normal text-danger">
            {errors.confirmPassword.message}
          </span>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-danger">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}

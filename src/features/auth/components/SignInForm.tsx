import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { Button, Input } from '@/shared/ui'
import { signInWithEmail } from '../api/authClient'
import { getEmailDomainSuggestion } from '../validation'
import {
  signInSchema,
  type SignInInput,
} from '../schemas'

export function SignInForm({
  onSuccess,
}: {
  onSuccess: () => void | Promise<void>
}) {
  const [showPassword, setShowPassword] = useState(false)
  const pending = useRef(false)
  const [submitError, setSubmitError] =
    useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onTouched',
  })

  const emailValue = useWatch({ control, name: 'email', defaultValue: '' })
  const possibleEmailTypo = getEmailDomainSuggestion(emailValue)

  const onSubmit = async (
    values: SignInInput,
  ) => {
    if (pending.current) return
    pending.current = true
    setSubmitError(null)

    try {
      await signInWithEmail(values)
      await onSuccess()
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.',
      )
    } finally { pending.current = false }
  }

  const isUnverified = submitError?.toLowerCase().includes('verify your email')

  return (
    <form
      autoComplete="off"
      onSubmit={(event) => { void handleSubmit(onSubmit)(event) }}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-in-email"
          className="text-sm font-medium text-text-secondary"
        >
          Email
        </label>

        <Input
          id="sign-in-email"
          type="email"
          autoComplete="off"
          aria-invalid={!!errors.email}
          aria-describedby={[errors.email && 'sign-in-email-error', possibleEmailTypo && 'sign-in-email-suggestion'].filter(Boolean).join(' ') || undefined}
          {...register('email')}
        />

        {possibleEmailTypo && (
          <p id="sign-in-email-suggestion" className="text-xs text-text-secondary" role="status">
            Check the address spelling: did you mean @gmail.com?
            Existing accounts with this address can still sign in.
          </p>
        )}

        {errors.email && (
          <span
            id="sign-in-email-error"
            className="text-sm font-normal text-danger"
          >
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-in-password"
          className="text-sm font-medium text-text-secondary"
        >
          Password
        </label>

        <div className="relative">
          <Input
            id="sign-in-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="pr-10"
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password
                ? 'sign-in-password-error'
                : undefined
            }
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted transition-colors hover:text-text-primary"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {errors.password && (
          <span
            id="sign-in-password-error"
            className="text-sm font-normal text-danger"
          >
            {errors.password.message}
          </span>
        )}
      </div>

      {submitError && (
        <div className="flex flex-col gap-1.5">
          <p
            role="alert"
            className="text-sm text-danger"
          >
            {submitError}
          </p>
          {isUnverified && (
            <Link
              to="/verify-email"
              state={{ email: emailValue }}
              className="text-xs font-medium text-brand-primary-on-dark hover:underline"
            >
              Enter verification code or resend OTP &rarr;
            </Link>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className="w-full"
      >
        {isSubmitting
          ? 'Signing in…'
          : 'Sign in'}
      </Button>
    </form>
  )
}

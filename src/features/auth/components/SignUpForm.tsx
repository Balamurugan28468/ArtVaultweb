import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input } from '@/shared/ui'
import { completeSignUp, signOutRegistrationSession as signOutUser, signUpWithEmail } from '../api/authClient'
import { getEmailDomainSuggestion } from '../validation'
import { signUpSchema, type SignUpInput } from '../schemas'
import { VerifyOtpForm } from './VerifyOtpForm'

export function SignUpForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showVerifiedRecovery, setShowVerifiedRecovery] = useState(false)
  const [attempt, setAttempt] = useState<{ email: string; userId: string; revision: number } | null>(null)
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null)
  const [otpBusy, setOtpBusy] = useState(false)
  const [clearingSession, setClearingSession] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const revision = useRef(0)
  const actionPending = useRef(false)
  const verificationSession = useRef(false)
  const active = useRef(true)
  const { register, handleSubmit, control, reset, setValue, formState: { errors, isSubmitting } } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onTouched',
  })
  const values = useWatch({ control })
  const suggestGmail = getEmailDomainSuggestion(values.email ?? '')
  const valid = signUpSchema.safeParse(values).success
  const emailVerified = Boolean(attempt && verifiedUserId === attempt.userId)
  const busy = isSubmitting || otpBusy || clearingSession

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      if (verificationSession.current) void signOutUser().catch(() => {})
    }
  }, [])

  const invalidateVerification = (event: React.FormEvent<HTMLFormElement>) => {
    if (emailVerified) return
    const name = (event.target as HTMLInputElement).name
    if (!['email', 'password', 'confirmPassword'].includes(name)) return
    revision.current += 1
    setAttempt(null)
    setVerifiedUserId(null)
    setSubmitError(null)
    setShowVerifiedRecovery(false)
    if (verificationSession.current) {
      verificationSession.current = false
      setClearingSession(true)
      void signOutUser().catch(() => {
        if (active.current) setSubmitError('Could not clear the verification session. Please try again.')
      }).finally(() => { if (active.current) setClearingSession(false) })
    }
  }

  const sendOtp = async (input: SignUpInput) => {
    if (actionPending.current || attempt || clearingSession) return
    actionPending.current = true
    const requestRevision = revision.current
    setSubmitError(null)
    setShowVerifiedRecovery(false)
    try {
      const result = await signUpWithEmail(input)
      if (active.current && requestRevision === revision.current) {
        setAttempt({ email: input.email, userId: result.user.id, revision: requestRevision })
      }
    } catch (error) {
      if (active.current) setSubmitError(error instanceof Error ? error.message : 'Could not send a verification code. Please try again.')
    } finally { actionPending.current = false }
  }

  const createAccount = async (input: SignUpInput) => {
    if (!attempt || !emailVerified || actionPending.current || otpBusy || clearingSession) return
    actionPending.current = true
    setSubmitError(null)
    try {
      await completeSignUp({ ...input, userId: attempt.userId })
      verificationSession.current = false
      reset()
      await onSuccess()
    } catch (error) {
      verificationSession.current = false
      setVerifiedUserId(null)
      setAttempt(null)
      // Supabase confirmed the email during Verify OTP. A later profile or
      // password-update failure must not invite the user to create the same
      // identity again: offer the verified account's sign-in/recovery path.
      setShowVerifiedRecovery(true)
      setSubmitError(error instanceof Error ? error.message : 'Could not complete registration. Please try again.')
    } finally { actionPending.current = false }
  }

  return (
    <form onSubmit={(event) => { void handleSubmit(sendOtp)(event) }} onChange={invalidateVerification} noValidate className="flex flex-col gap-4">
      <fieldset disabled={busy || emailVerified} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-up-name"
          className="text-sm font-medium text-text-secondary"
        >
          Name
        </label>

        <Input
          id="sign-up-name"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.displayName}
          aria-describedby={
            errors.displayName
              ? 'sign-up-name-error'
              : undefined
          }
          {...register('displayName')}
        />

        {errors.displayName && (
          <span
            id="sign-up-name-error"
            className="text-sm font-normal text-danger"
          >
            {errors.displayName.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-up-email"
          className="text-sm font-medium text-text-secondary"
        >
          Email
        </label>

        <Input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={
            [errors.email && 'sign-up-email-error', suggestGmail && 'sign-up-email-suggestion'].filter(Boolean).join(' ') || undefined
          }
          {...register('email')}
        />

        {suggestGmail && (
          <div id="sign-up-email-suggestion" className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span>Did you mean @gmail.com? Confirm the spelling before sending a code.</span>
            <button
              type="button"
              disabled={busy || Boolean(attempt)}
              className="font-semibold text-brand-primary-on-dark underline-offset-2 hover:underline"
              onClick={() => {
                const localPart = (values.email ?? '').trim().split('@')[0]
                setValue('email', `${localPart}@gmail.com`, { shouldValidate: true, shouldDirty: true, shouldTouch: true })
              }}
            >
              Use gmail.com
            </button>
          </div>
        )}

        {errors.email && (
          <span
            id="sign-up-email-error"
            className="text-sm font-normal text-danger"
          >
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-up-password"
          className="text-sm font-medium text-text-secondary"
        >
          Password
        </label>

        <div className="relative">
          <Input
            id="sign-up-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="pr-10"
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password
                ? 'sign-up-password-error sign-up-password-hint'
                : 'sign-up-password-hint'
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

        <span
          id="sign-up-password-hint"
          className="text-xs font-normal text-text-muted"
        >
          At least 8 characters, with an uppercase
          letter, a lowercase letter, and a number.
        </span>

        {errors.password && (
          <span
            id="sign-up-password-error"
            className="text-sm font-normal text-danger"
          >
            {errors.password.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="sign-up-confirm-password"
          className="text-sm font-medium text-text-secondary"
        >
          Confirm Password
        </label>

        <div className="relative">
          <Input
            id="sign-up-confirm-password"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="pr-10"
            aria-invalid={
              !!errors.confirmPassword
            }
            aria-describedby={
              errors.confirmPassword
                ? 'sign-up-confirm-password-error'
                : undefined
            }
            {...register('confirmPassword')}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            aria-pressed={showConfirmPassword}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted transition-colors hover:text-text-primary"
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {errors.confirmPassword && (
          <span
            id="sign-up-confirm-password-error"
            className="text-sm font-normal text-danger"
          >
            {errors.confirmPassword.message}
          </span>
        )}
      </div>

      </fieldset>
      {submitError && <p role="alert" className="text-sm text-danger">{submitError}</p>}
      {showVerifiedRecovery && (
        <p className="text-sm text-text-secondary">
          Your email was already verified. Instead of registering again, try{' '}
          <a href="/sign-in" className="font-semibold text-brand-primary-on-dark underline">signing in</a>{' '}
          with the registered email and password, or use password recovery.
        </p>
      )}
      <Button type="submit" disabled={busy || attempt !== null} size="lg" className="w-full">
        {isSubmitting && !emailVerified ? 'Sending OTP...' : 'Send OTP'}
      </Button>
      <section aria-labelledby="signup-otp-heading" className="flex min-w-0 flex-col gap-3">
        <h2 id="signup-otp-heading" className="font-medium text-text-primary">OTP Verification</h2>
        {attempt ? (
          <p role="status" className="break-words text-sm text-text-secondary">OTP sent successfully. Verification code sent to {attempt.email}</p>
        ) : (
          <p className="text-sm text-text-secondary">Enter the verification code after clicking Send OTP.</p>
        )}
          <VerifyOtpForm key={attempt?.revision ?? 'unsent'} initialEmail={attempt?.email ?? ''} embedded retainSession disabled={!attempt || emailVerified || isSubmitting}
            showResend={Boolean(attempt)}
            onBusyChange={setOtpBusy}
            onSuccess={async ({ email, userId }) => {
              if (!attempt || revision.current !== attempt.revision || email !== attempt.email || userId !== attempt.userId) {
                await signOutUser()
                return
              }
              verificationSession.current = true
              setVerifiedUserId(userId)
            }} />
        {emailVerified && <p role="status" className="text-sm font-medium text-emerald-400">&#10003; Email verified successfully</p>}
        {emailVerified && <p className="text-sm text-text-secondary">Your verified details are locked. Click Create Account to finish, then sign in manually.</p>}
      </section>
      <Button type="button" onClick={() => void handleSubmit(createAccount)()} disabled={!valid || !emailVerified || busy} size="lg" className="w-full">
        {isSubmitting && emailVerified ? 'Creating account...' : 'Create Account'}
      </Button>
    </form>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { authEmailField, EMAIL_OTP_LENGTH } from '../validation'
import { Button, Input } from '@/shared/ui'
import { resendVerificationOtp, signOutRegistrationSession as signOutUser, verifyEmailOtp } from '../api/authClient'

interface VerifyOtpFormProps {
  initialEmail?: string
  onSuccess: (data: { email: string; userId?: string }) => void | Promise<void>
  embedded?: boolean
  retainSession?: boolean
  disabled?: boolean
  showResend?: boolean
  onBusyChange?: (busy: boolean) => void
  onRestart?: () => void
}

export function VerifyOtpForm({
  initialEmail = '',
  onSuccess,
  onRestart,
  embedded = false,
  retainSession = false,
  disabled = false,
  showResend = true,
  onBusyChange,
}: VerifyOtpFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [digits, setDigits] = useState<string[]>(() => Array<string>(EMAIL_OTP_LENGTH).fill(''))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [verified, setVerified] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(showResend ? 60 : 0)

  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; onBusyChange?.(false) } }, [onBusyChange])

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!disabled) inputRefs.current[0]?.focus()
  }, [disabled])

  useEffect(() => {
    if (!showResend || resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [showResend, resendCooldown])

  const handleDigitChange = (index: number, value: string) => {
    setSubmitError(null)
    setInfoMessage(null)

    // Only allow numeric characters
    const numericChar = value.replace(/\D/g, '')

    if (!numericChar) {
      const nextDigits = [...digits]
      nextDigits[index] = ''
      setDigits(nextDigits)
      return
    }

    // If multiple characters pasted into one box
    if (numericChar.length > 1) {
      handlePastedCode(numericChar)
      return
    }

    const nextDigits = [...digits]
    nextDigits[index] = numericChar[numericChar.length - 1]
    setDigits(nextDigits)

    // Auto-focus next box
    if (index < EMAIL_OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < EMAIL_OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePastedCode = (pastedText: string) => {
    setSubmitError(null)
    setInfoMessage(null)
    const cleanNumbers = pastedText.replace(/\D/g, '')
    if (cleanNumbers.length > EMAIL_OTP_LENGTH) {
      setDigits(Array<string>(EMAIL_OTP_LENGTH).fill(''))
      setSubmitError(`Enter the complete ${EMAIL_OTP_LENGTH}-digit code. Longer codes cannot be truncated.`)
      return
    }
    if (!cleanNumbers) return

    const nextDigits = [...digits]
    for (let i = 0; i < EMAIL_OTP_LENGTH; i++) {
      nextDigits[i] = cleanNumbers[i] || ''
    }
    setDigits(nextDigits)

    const nextFocusIndex = Math.min(cleanNumbers.length, EMAIL_OTP_LENGTH - 1)
    inputRefs.current[nextFocusIndex]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text')
    handlePastedCode(pastedData)
  }

  const token = digits.join('')
  const isComplete = token.length === EMAIL_OTP_LENGTH

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (disabled || verified || pending.current || isSubmitting || isResending) return
    setSubmitError(null)
    setInfoMessage(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!authEmailField().safeParse(normalizedEmail).success) {
      setSubmitError('Please enter a valid registration email address.')
      return
    }

    if (!isComplete) {
      setSubmitError('Please enter the full 6-digit verification code.')
      return
    }

    pending.current = true
    setIsSubmitting(true)
    onBusyChange?.(true)
    try {
      const input = { email: normalizedEmail, token }
      const { user } = retainSession ? await verifyEmailOtp(input, { retainSession: true }) : await verifyEmailOtp(input)
      if (!active.current) {
        if (retainSession) await signOutUser()
        return
      }
      await onSuccess({ email: normalizedEmail, ...(retainSession ? { userId: user.id } : {}) })
      setVerified(true)
      setDigits(Array<string>(EMAIL_OTP_LENGTH).fill(''))
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to verify verification code. Please try again.',
      )
    } finally {
      pending.current = false
      if (active.current) { setIsSubmitting(false); onBusyChange?.(false) }
    }
  }

  const handleResend = async () => {
    if (disabled || verified || pending.current || isResending || isSubmitting || resendCooldown > 0) return
    setSubmitError(null)
    setInfoMessage(null)

    const normalizedEmail = email.trim().toLowerCase()
    if (!authEmailField().safeParse(normalizedEmail).success) {
      setSubmitError('Please enter a valid email to receive a new code.')
      return
    }

    pending.current = true
    setIsResending(true)
    onBusyChange?.(true)
    try {
      await resendVerificationOtp(normalizedEmail)
      setDigits(Array<string>(EMAIL_OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
      setInfoMessage('A new verification code has been sent to your email.')
      setResendCooldown(60)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Failed to resend verification code. Please try again later.',
      )
    } finally {
      pending.current = false
      if (active.current) { setIsResending(false); onBusyChange?.(false) }
    }
  }

  const Container = embedded ? 'div' : 'form'
  return (
    <Container onSubmit={embedded ? undefined : handleSubmit} noValidate={embedded ? undefined : true} className="flex flex-col gap-5">
      {!embedded && (!initialEmail ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="otp-email"
            className="text-sm font-medium text-text-secondary"
          >
            Registration Email
          </label>
          <Input
            id="otp-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your-email@example.com"
            autoComplete="email"
            required
          />
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          We sent a 6-digit verification code to:{' '}
          <span className="font-semibold text-text-primary">{initialEmail}</span>
        </p>
      ))}

      <div className="flex flex-col items-center gap-2">
        <label htmlFor="otp-digit-0" className="sr-only">
          6-digit verification code
        </label>
        <div className="grid w-full grid-cols-6 gap-2 sm:gap-3">
          {digits.map((digit, index) => (
            <input
              key={index}
              id={`otp-digit-${index}`}
              ref={(el) => {
                inputRefs.current[index] = el
              }}
              disabled={disabled || verified || isSubmitting || isResending}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              aria-label={`Digit ${index + 1} of 6`}
              className="h-12 min-w-0 w-full rounded-lg border border-border-default bg-surface-raised text-center font-mono text-xl font-semibold text-text-primary shadow-sm outline-none transition-colors focus:border-brand-primary focus:ring-1 focus:ring-brand-primary sm:h-14 sm:text-2xl"
            />
          ))}
        </div>
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {submitError}
        </div>
      )}

      {infoMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400"
        >
          {infoMessage}
        </div>
      )}

      <Button
        type={embedded ? "button" : "submit"}
        onClick={embedded ? () => void handleSubmit() : undefined}
        disabled={disabled || verified || isSubmitting || isResending || !isComplete}
        size="lg"
        className="w-full"
      >
        {isSubmitting ? 'Verifying OTP…' : 'Verify OTP'}
      </Button>

      <div className="flex flex-col items-center gap-3 pt-2 text-sm text-text-secondary">
        {showResend && <div className="flex flex-wrap justify-center items-center gap-2">
          <span>Didn&apos;t receive code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={disabled || verified || isSubmitting || isResending || resendCooldown > 0}
            className="font-medium text-brand-primary-on-dark transition-colors hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
          >
            {isResending
              ? 'Sending…'
              : resendCooldown > 0
                ? `Resend OTP in ${resendCooldown}s`
                : 'Resend OTP'}
          </button>
        </div>}

        {!embedded && (onRestart ? <button type="button" onClick={onRestart}>Back to Registration</button> : <Link
          to="/sign-up"
          className="font-medium text-text-muted transition-colors hover:text-text-primary hover:underline"
        >
          Back to Registration
        </Link>)}
      </div>
    </Container>
  )
}

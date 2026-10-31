import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignUpForm } from './SignUpForm'

const signUpWithEmail = vi.fn()
const verifyEmailOtp = vi.fn()
const resendVerificationOtp = vi.fn()
const completeSignUp = vi.fn()
const signOutUser = vi.fn()
vi.mock('../api/authClient', () => ({
  signUpWithEmail: (...args: unknown[]) => signUpWithEmail(...args),
  verifyEmailOtp: (...args: unknown[]) => verifyEmailOtp(...args),
  resendVerificationOtp: (...args: unknown[]) => resendVerificationOtp(...args),
  completeSignUp: (...args: unknown[]) => completeSignUp(...args),
  signOutUser: (...args: unknown[]) => signOutUser(...args),
  signOutRegistrationSession: (...args: unknown[]) => signOutUser(...args),
}))

beforeEach(() => {
  signUpWithEmail.mockReset().mockResolvedValue({ user: { id: 'alice' }, needsEmailConfirmation: true })
  verifyEmailOtp.mockReset().mockResolvedValue({ user: { id: 'alice' } })
  resendVerificationOtp.mockReset().mockResolvedValue(undefined)
  completeSignUp.mockReset().mockResolvedValue(undefined)
  signOutUser.mockReset().mockResolvedValue(undefined)
})

function fillValidForm() {
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
  fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Longenough1' } })
}

it.each(['gmal.com', 'gmial.com', 'gmai.com', 'gmail.con', 'gmali.com'])('blocks Send OTP for %s without silently changing the entered address', async (domain) => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  fillValidForm()
  const email = `alice@${domain}`
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } })
  expect(screen.getByText(/Did you mean @gmail.com\?/)).toBeVisible()
  expect(screen.getByLabelText('Email')).toHaveValue(email)
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'sign-up-email-suggestion')
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
  expect(await screen.findByText('Did you mean @gmail.com? Please check your email before sending a code.')).toBeVisible()
  expect(signUpWithEmail).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Digit 1 of 6')).toBeDisabled()
  expect(screen.getByLabelText('Email')).toHaveValue(email)
})

it('removes the optional suggestion when the user edits the domain and accepts other providers', () => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@gmal.com' } })
  expect(screen.getByText(/Did you mean @gmail.com\?/)).toBeVisible()
  for (const email of ['alice@gmail.com', 'alice@outlook.com', 'alice@example.org', 'not-an-email']) {
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: email } })
    expect(screen.queryByText(/Did you mean @gmail.com\?/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue(email)
  }
})

it('only replaces a suggested Gmail typo when the user explicitly clicks the correction', async () => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  fillValidForm()
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'Alice@Gmal.com' } })
  expect(screen.getByLabelText('Email')).toHaveValue('Alice@Gmal.com')
  fireEvent.click(screen.getByRole('button', { name: 'Use gmail.com' }))
  expect(screen.getByLabelText('Email')).toHaveValue('Alice@gmail.com')
  expect(screen.queryByRole('button', { name: 'Use gmail.com' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
  await waitFor(() => expect(signUpWithEmail).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'alice@gmail.com' }),
  ))
})

describe('SignUpForm', () => {
  it('shows validation errors instead of submitting when fields are invalid', async () => {
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('marks an invalid field with aria-invalid and points aria-describedby at the error', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    const nameInput = await screen.findByLabelText('Name')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput.getAttribute('aria-describedby')).toContain('sign-up-name-error')
  })

  it('rejects a malformed email with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects a display name that is too short with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'A' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Name must be at least 2 characters.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects a password that is too short with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Ab1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Ab1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('moves focus to the first invalid field on a failed submit', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    await screen.findByText('Name is required.')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('disables the submit button while a submission is in flight, preventing duplicate submits', async () => {
    let resolveSignUp: (value: { user: { id: string }; needsEmailConfirmation: boolean }) => void = () => {}
    signUpWithEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignUp = resolve
        }),
    )
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    const submitButton = screen.getByRole('button', { name: /send otp/i })
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    expect(signUpWithEmail).toHaveBeenCalledTimes(1)

    fireEvent.click(submitButton)
    expect(signUpWithEmail).toHaveBeenCalledTimes(1)

    resolveSignUp({ user: { id: 'alice' }, needsEmailConfirmation: true })
  })

  it('rejects a password missing complexity requirements with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Password must contain at least one uppercase letter.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Different1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('calls signUpWithEmail and onSuccess when the form is valid', async () => {
    signUpWithEmail.mockResolvedValueOnce({ user: { id: 'alice' }, needsEmailConfirmation: true })
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    await waitFor(() => expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled())
    expect(onSuccess).not.toHaveBeenCalled()
    await verifyCode()
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(signUpWithEmail).toHaveBeenCalledWith({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'Longenough1',
      confirmPassword: 'Longenough1',
    })
  })

  it('normalizes email casing and trims the name before submitting', async () => {
    signUpWithEmail.mockResolvedValueOnce({ user: { id: 'alice' }, needsEmailConfirmation: true })
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: '  Alice  ' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: '  Alice@Example.com  ' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    await waitFor(() =>
      expect(signUpWithEmail).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice', email: 'alice@example.com' }),
      ),
    )
  })

  it('shows the mapped error message when sign-up fails (e.g. email already in use)', async () => {
    signUpWithEmail.mockRejectedValueOnce(new Error('Registration could not be completed. If you already have an account, sign in or use password recovery.'))
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration could not be completed. If you already have an account, sign in or use password recovery.')
  })

  it('preserves entered values after a failed submission', async () => {
    signUpWithEmail.mockRejectedValueOnce(new Error('Something went wrong. Please try again.'))
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice')
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
  })

  it('toggles password and confirm password visibility when eye button is clicked', () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    const passwordInput = screen.getByLabelText('Password')
    const confirmPasswordInput = screen.getByLabelText('Confirm Password')
    const showPasswordBtns = screen.getAllByRole('button', { name: /show password/i })

    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(confirmPasswordInput).toHaveAttribute('type', 'password')

    // Click show password for password input
    fireEvent.click(showPasswordBtns[0])
    expect(passwordInput).toHaveAttribute('type', 'text')

    // Click hide password for password input
    const hidePasswordBtn = screen.getByRole('button', { name: /hide password/i })
    fireEvent.click(hidePasswordBtn)
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Click show password for confirm password input
    const remainingShowBtns = screen.getAllByRole('button', { name: /show confirm password/i })
    fireEvent.click(remainingShowBtns[0])
    expect(confirmPasswordInput).toHaveAttribute('type', 'text')
  })

  it('finalizes only after verification and never passes credentials to the page', async () => {
    signUpWithEmail.mockResolvedValueOnce({ user: { id: 'alice' }, needsEmailConfirmation: true })
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /send otp/i }))

    await waitFor(() => expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled())
    expect(onSuccess).not.toHaveBeenCalled()
    await verifyCode()
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith())
    expect(completeSignUp).toHaveBeenCalledWith({ displayName: 'Alice', email: 'alice@example.com', password: 'Longenough1', confirmPassword: 'Longenough1', userId: 'alice' })
  })
})

async function sendCode() {
  fillValidForm()
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
  await waitFor(() => expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled())
}
async function verifyCode() {
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await screen.findByText('\u2713 Email verified successfully')
}
it('keeps all registration fields and the OTP section together; final action starts disabled', () => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  for (const label of ['Name', 'Email', 'Password', 'Confirm Password']) expect(screen.getByLabelText(label)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'OTP Verification' })).toBeInTheDocument()
  for (let i = 1; i <= 6; i++) {
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeVisible()
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeDisabled()
  }
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  expect(screen.getByText('Enter the verification code after clicking Send OTP.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Resend OTP/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
})
it('renders six numeric OTP inputs without removing the password fields; verifies before enabling final creation', async () => {
  const onSuccess = vi.fn()
  render(<SignUpForm onSuccess={onSuccess} />)
  await sendCode()
  expect(document.querySelectorAll('form')).toHaveLength(1)
  expect(screen.getByText(/Verification code sent to alice@example.com/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Resend OTP in 60s' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  fireEvent.input(screen.getByLabelText('Digit 1 of 6'), { target: { value: '1' } })
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeEnabled()
  for (let i = 1; i <= 6; i++) {
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeEnabled()
  }
  expect(screen.getByLabelText('Password')).toHaveValue('Longenough1')
  expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
  await verifyCode()
  expect(verifyEmailOtp).toHaveBeenCalledWith({ email: 'alice@example.com', token: '123456' }, { retainSession: true })
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  for (let i = 1; i <= 6; i++) expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeDisabled()
  expect(onSuccess).not.toHaveBeenCalled()
  expect(completeSignUp).not.toHaveBeenCalled()
})
it.each(['Name', 'Email', 'Password', 'Confirm Password'])('locks verified %s rather than pretending to undo server-side verification', async (label) => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  await verifyCode()
  expect(screen.getByLabelText(label)).toBeDisabled()
  expect(screen.getByText('\u2713 Email verified successfully')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  expect(screen.getByLabelText('Digit 1 of 6')).toBeVisible()
  expect(screen.getByLabelText('Digit 1 of 6')).toBeDisabled()
  expect(signOutUser).not.toHaveBeenCalled()
  expect(completeSignUp).not.toHaveBeenCalled()
})
it('rejects an incorrect OTP and never enables account completion', async () => {
  verifyEmailOtp.mockRejectedValueOnce(new Error('The verification code is incorrect.'))
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The verification code is incorrect.')
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
})
it('cannot transfer verified state to a different pending auth UUID', async () => {
  verifyEmailOtp.mockResolvedValueOnce({ user: { id: 'other' } })
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await waitFor(() => expect(signOutUser).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
})
it('does not persist passwords or OTPs to browser storage', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  await verifyCode()
  expect(storage).not.toHaveBeenCalled()
  storage.mockRestore()
})
it('requires verification again if final server validation fails', async () => {
  completeSignUp.mockRejectedValueOnce(new Error('Verification no longer matches this registration.'))
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  await verifyCode()
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Verification no longer matches')
  expect(screen.getByRole('link', { name: 'signing in' })).toHaveAttribute('href', '/sign-in')
  expect(screen.getByText(/Your email was already verified/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
})

it('locks the verified name and keeps the immutable registration valid', async () => {
  render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  await verifyCode()
  expect(screen.getByLabelText('Name')).toBeDisabled()
  expect(screen.getByLabelText('Name')).toHaveValue('Alice')
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeEnabled()
  expect(completeSignUp).not.toHaveBeenCalled()
})
it('cleans up a verified temporary session when registration is abandoned', async () => {
  const view = render(<SignUpForm onSuccess={vi.fn()} />)
  await sendCode()
  await verifyCode()
  view.unmount()
  expect(signOutUser).toHaveBeenCalledTimes(1)
})

it('keeps OTP controls visible and disabled after sending fails', async () => {
  signUpWithEmail.mockRejectedValueOnce(new Error('The verification email could not be sent. Please try again later or contact support.'))
  render(<SignUpForm onSuccess={vi.fn()} />)
  fillValidForm()
  fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The verification email could not be sent.')
  for (let i = 1; i <= 6; i++) {
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeVisible()
    expect(screen.getByLabelText('Digit ' + i + ' of 6')).toBeDisabled()
  }
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Create Account' })).toBeDisabled()
  expect(screen.getByText('Enter the verification code after clicking Send OTP.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Resend OTP/ })).not.toBeInTheDocument()
  expect(verifyEmailOtp).not.toHaveBeenCalled()
  expect(completeSignUp).not.toHaveBeenCalled()
})

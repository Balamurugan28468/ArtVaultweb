import { MemoryRouter } from 'react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInForm } from './SignInForm'

const signInWithEmail = vi.fn()
vi.mock('../api/authClient', () => ({ signInWithEmail: (...args: unknown[]) => signInWithEmail(...args) }))

beforeEach(() => {
  signInWithEmail.mockReset()
})

function renderSignInForm(props?: { onSuccess?: () => void }) {
  const onSuccess = props?.onSuccess || vi.fn()
  return {
    ...render(
      <MemoryRouter>
        <SignInForm onSuccess={onSuccess} />
      </MemoryRouter>,
    ),
    onSuccess,
  }
}

describe('SignInForm', () => {
  it('normalizes email whitespace and case without changing the mailbox domain or password', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const { onSuccess } = renderSignInForm()
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: '  Alice@Gmal.com  ' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: ' Testpass1 ' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(signInWithEmail).toHaveBeenCalledExactlyOnceWith({ email: 'alice@gmal.com', password: ' Testpass1 ' })
  })

  it('warns about probable Gmail typos but does not block existing legitimate accounts', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const { onSuccess } = renderSignInForm()
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@gmal.com' } })
    expect(screen.getByText(/Check the address spelling: did you mean @gmail.com\?/)).toBeVisible()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'sign-in-email-suggestion')
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'KnownPassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(signInWithEmail).toHaveBeenCalledExactlyOnceWith({ email: 'alice@gmal.com', password: 'KnownPassword123' })
  })

  it('shows a validation error instead of submitting when the email is missing', async () => {
    const { onSuccess } = renderSignInForm()

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a validation error for a malformed email', async () => {
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('shows a validation error when the password is missing', async () => {
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Password is required.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('does not apply sign-up password complexity rules — a simple existing password is accepted', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const { onSuccess } = renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'alllowercase' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('calls signInWithEmail and onSuccess when the form is valid', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const { onSuccess } = renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('shows a generic, enumeration-safe error for invalid credentials', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Invalid email or password.'))
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  it('preserves the entered email after a failed sign-in attempt', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Invalid email or password.'))
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
  })

  it('shows a safe message, not a raw Firebase code, for a disabled account', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('This account is currently unavailable.'))
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is currently unavailable.')
  })

  it('shows a network error message when the connection/emulator is unreachable', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Network error — check your connection and try again.'))
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i)
  })

  it('moves focus to the first invalid field on a failed submit', async () => {
    renderSignInForm()

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByText('Email is required.')
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('disables the submit button while a submission is in flight, preventing duplicate submits', async () => {
    let resolveSignIn: (value: { uid: string }) => void = () => {}
    signInWithEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
    )
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    const submitButton = screen.getByRole('button', { name: /sign in/i })
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    expect(signInWithEmail).toHaveBeenCalledTimes(1)

    fireEvent.click(submitButton)
    expect(signInWithEmail).toHaveBeenCalledTimes(1)

    resolveSignIn({ uid: 'alice' })
  })

  it('toggles password visibility when the eye button is clicked', () => {
    renderSignInForm()

    const passwordInput = screen.getByLabelText('Password')
    const showBtn = screen.getByRole('button', { name: /show password/i })

    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.click(showBtn)
    expect(passwordInput).toHaveAttribute('type', 'text')

    const hideBtn = screen.getByRole('button', { name: /hide password/i })
    fireEvent.click(hideBtn)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('shows link to /verify-email when sign-in fails due to unverified email', async () => {
    signInWithEmail.mockRejectedValueOnce(
      new Error('Please verify your email before signing in.'),
    )
    renderSignInForm()

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please verify your email before signing in.')
    const link = screen.getByRole('link', { name: /enter verification code/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/verify-email')
  })

  it('starts with empty credentials and discourages autofill', () => {
    renderSignInForm()
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
  })
})

it('clears credentials on remount and preserves typed password when toggling', () => {
  const view = renderSignInForm()
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'typed@example.com' } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'TypedPass1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByLabelText('Password')).toHaveValue('TypedPass1')
  view.unmount()
  renderSignInForm()
  expect(screen.getByLabelText('Email')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
})

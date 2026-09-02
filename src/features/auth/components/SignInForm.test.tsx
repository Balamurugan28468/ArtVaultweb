import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInForm } from './SignInForm'

const signInWithEmail = vi.fn()
vi.mock('../api/authClient', () => ({ signInWithEmail: (...args: unknown[]) => signInWithEmail(...args) }))

beforeEach(() => {
  signInWithEmail.mockReset()
})

describe('SignInForm', () => {
  it('shows a validation error instead of submitting when the email is missing', async () => {
    const onSuccess = vi.fn()
    render(<SignInForm onSuccess={onSuccess} />)

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('shows a validation error for a malformed email', async () => {
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('shows a validation error when the password is missing', async () => {
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Password is required.')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
  })

  it('does not apply sign-up password complexity rules — a simple existing password is accepted', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const onSuccess = vi.fn()
    render(<SignInForm onSuccess={onSuccess} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'alllowercase' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('calls signInWithEmail and onSuccess when the form is valid', async () => {
    signInWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const onSuccess = vi.fn()
    render(<SignInForm onSuccess={onSuccess} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('shows a generic, enumeration-safe error for invalid credentials', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Invalid email or password.'))
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  })

  it('preserves the entered email after a failed sign-in attempt', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Invalid email or password.'))
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
  })

  it('shows a safe message, not a raw Firebase code, for a disabled account', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('This account is currently unavailable.'))
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account is currently unavailable.')
  })

  it('shows a network error message when the connection/emulator is unreachable', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Network error — check your connection and try again.'))
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i)
  })

  it('moves focus to the first invalid field on a failed submit', async () => {
    render(<SignInForm onSuccess={vi.fn()} />)

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
    render(<SignInForm onSuccess={vi.fn()} />)

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
})

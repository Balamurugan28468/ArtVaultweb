import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignInForm } from './SignInForm'

const signInWithEmail = vi.fn()
vi.mock('../api/authClient', () => ({ signInWithEmail: (...args: unknown[]) => signInWithEmail(...args) }))

describe('SignInForm', () => {
  it('shows a validation error instead of submitting when the email is missing', async () => {
    const onSuccess = vi.fn()
    render(<SignInForm onSuccess={onSuccess} />)

    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(signInWithEmail).not.toHaveBeenCalled()
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

  it('shows the error message when sign-in fails', async () => {
    signInWithEmail.mockRejectedValueOnce(new Error('Incorrect email or password.'))
    render(<SignInForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })
})

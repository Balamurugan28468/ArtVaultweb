import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SignUpForm } from './SignUpForm'

const signUpWithEmail = vi.fn()
vi.mock('../api/authClient', () => ({ signUpWithEmail: (...args: unknown[]) => signUpWithEmail(...args) }))

function fillValidForm() {
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough' } })
  fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
}

describe('SignUpForm', () => {
  it('shows validation errors instead of submitting when fields are invalid', async () => {
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('calls signUpWithEmail and onSuccess when the form is valid', async () => {
    signUpWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(signUpWithEmail).toHaveBeenCalledWith({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'longenough',
      confirmPassword: 'longenough',
    })
  })

  it('shows the error message when sign-up fails', async () => {
    signUpWithEmail.mockRejectedValueOnce(new Error('An account with this email already exists.'))
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists.',
    )
  })
})

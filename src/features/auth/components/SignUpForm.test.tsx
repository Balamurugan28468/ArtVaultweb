import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignUpForm } from './SignUpForm'

const signUpWithEmail = vi.fn()
vi.mock('../api/authClient', () => ({ signUpWithEmail: (...args: unknown[]) => signUpWithEmail(...args) }))

beforeEach(() => {
  signUpWithEmail.mockReset()
})

function fillValidForm() {
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
  fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Longenough1' } })
}

describe('SignUpForm', () => {
  it('shows validation errors instead of submitting when fields are invalid', async () => {
    const onSuccess = vi.fn()
    render(<SignUpForm onSuccess={onSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('marks an invalid field with aria-invalid and points aria-describedby at the error', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    const nameInput = await screen.findByLabelText('Name')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput.getAttribute('aria-describedby')).toContain('sign-up-name-error')
  })

  it('rejects a malformed email with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects a display name that is too short with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'A' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Name must be at least 2 characters.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects a password that is too short with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Ab1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Ab1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('moves focus to the first invalid field on a failed submit', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await screen.findByText('Name is required.')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('disables the submit button while a submission is in flight, preventing duplicate submits', async () => {
    let resolveSignUp: (value: { uid: string }) => void = () => {}
    signUpWithEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignUp = resolve
        }),
    )
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    const submitButton = screen.getByRole('button', { name: /create account/i })
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    expect(signUpWithEmail).toHaveBeenCalledTimes(1)

    fireEvent.click(submitButton)
    expect(signUpWithEmail).toHaveBeenCalledTimes(1)

    resolveSignUp({ uid: 'alice' })
  })

  it('rejects a password missing complexity requirements with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Password must contain at least one uppercase letter.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
  })

  it('rejects mismatched passwords with a specific message', async () => {
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Alice' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Different1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(signUpWithEmail).not.toHaveBeenCalled()
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
      password: 'Longenough1',
      confirmPassword: 'Longenough1',
    })
  })

  it('normalizes email casing and trims the name before submitting', async () => {
    signUpWithEmail.mockResolvedValueOnce({ uid: 'alice' })
    render(<SignUpForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Name'), { target: { value: '  Alice  ' } })
    fireEvent.input(screen.getByLabelText('Email'), { target: { value: '  Alice@Example.com  ' } })
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'Longenough1' } })
    fireEvent.input(screen.getByLabelText('Confirm password'), { target: { value: 'Longenough1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(signUpWithEmail).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice', email: 'alice@example.com' }),
      ),
    )
  })

  it('shows the mapped error message when sign-up fails (e.g. email already in use)', async () => {
    signUpWithEmail.mockRejectedValueOnce(new Error('An account with this email already exists.'))
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.')
  })

  it('preserves entered values after a failed submission', async () => {
    signUpWithEmail.mockRejectedValueOnce(new Error('Something went wrong. Please try again.'))
    render(<SignUpForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await screen.findByRole('alert')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice')
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SellerApplicationForm } from './SellerApplicationForm'

const applyAsSeller = vi.fn()
vi.mock('../api/sellerRepository', () => ({ applyAsSeller: (...args: unknown[]) => applyAsSeller(...args) }))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  applyAsSeller.mockReset()
  useAuth.mockReturnValue({ user: { uid: 'alice', email: 'alice@example.com' } })
})

function fillValidForm() {
  fireEvent.input(screen.getByLabelText('Business name'), { target: { value: 'Alice Fine Art' } })
  fireEvent.input(screen.getByLabelText(/tell us about what you sell/i), {
    target: { value: 'Contemporary oil landscapes.' },
  })
}

describe('SellerApplicationForm', () => {
  it('prefills the contact email from the signed-in account', () => {
    render(<SellerApplicationForm onSuccess={vi.fn()} />)
    expect(screen.getByLabelText('Contact email')).toHaveValue('alice@example.com')
  })

  it('shows validation errors instead of submitting when required fields are empty', async () => {
    render(<SellerApplicationForm onSuccess={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    expect(await screen.findByText('Business name is required.')).toBeInTheDocument()
    expect(applyAsSeller).not.toHaveBeenCalled()
  })

  it('marks an invalid field with aria-invalid and points aria-describedby at the error', async () => {
    render(<SellerApplicationForm onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    const nameInput = await screen.findByLabelText('Business name')
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput.getAttribute('aria-describedby')).toContain('seller-business-name-error')
  })

  it('rejects a description that is too short with a specific message', async () => {
    render(<SellerApplicationForm onSuccess={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Business name'), { target: { value: 'Alice Fine Art' } })
    fireEvent.input(screen.getByLabelText(/tell us about what you sell/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    expect(await screen.findByText('Seller description must be at least 10 characters.')).toBeInTheDocument()
    expect(applyAsSeller).not.toHaveBeenCalled()
  })

  it('rejects a malformed contact email', async () => {
    render(<SellerApplicationForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.input(screen.getByLabelText('Contact email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(applyAsSeller).not.toHaveBeenCalled()
  })

  it('submits successfully and calls onSuccess', async () => {
    applyAsSeller.mockResolvedValueOnce(undefined)
    const onSuccess = vi.fn()
    render(<SellerApplicationForm onSuccess={onSuccess} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(applyAsSeller).toHaveBeenCalledWith('alice', {
      businessName: 'Alice Fine Art',
      description: 'Contemporary oil landscapes.',
      contactEmail: 'alice@example.com',
    })
  })

  it('shows a safe server-error message on failure and preserves entered values', async () => {
    applyAsSeller.mockRejectedValueOnce(new Error('You do not have permission to do that.'))
    render(<SellerApplicationForm onSuccess={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to do that.')
    expect(screen.getByLabelText('Business name')).toHaveValue('Alice Fine Art')
  })

  it('disables the submit button while in flight, preventing duplicate submits', async () => {
    let resolveApply: () => void = () => {}
    applyAsSeller.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveApply = resolve)))
    render(<SellerApplicationForm onSuccess={vi.fn()} />)

    fillValidForm()
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    fireEvent.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    expect(applyAsSeller).toHaveBeenCalledTimes(1)

    fireEvent.click(submitButton)
    expect(applyAsSeller).toHaveBeenCalledTimes(1)

    resolveApply()
  })
})

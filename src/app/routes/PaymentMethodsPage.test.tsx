import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PaymentMethodsPage } from './PaymentMethodsPage'

describe('PaymentMethodsPage', () => {
  it('renders supported payment methods: UPI, Card, and Cash on Delivery', () => {
    render(
      <MemoryRouter>
        <PaymentMethodsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Payment Methods')).toBeInTheDocument()
    expect(screen.getByText(/Instant UPI/i)).toBeInTheDocument()
    expect(screen.getByText(/Cards/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Cash on Delivery/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Razorpay Test Sandbox/i)).toBeInTheDocument()
  })

  it('allows saving a UPI VPA ID', () => {
    render(
      <MemoryRouter>
        <PaymentMethodsPage />
      </MemoryRouter>,
    )

    const input = screen.getByPlaceholderText('e.g. collector@okhdfcbank')
    fireEvent.change(input, { target: { value: 'artcollector@okaxis' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save UPI ID' }))

    expect(screen.getByText(/Payment preference updated successfully/i)).toBeInTheDocument()
  })
})

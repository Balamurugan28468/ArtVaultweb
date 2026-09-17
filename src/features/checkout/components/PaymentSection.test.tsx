import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentSection } from './PaymentSection'

describe('PaymentSection', () => {
  it('renders the Payment heading and the real payment-method selector', () => {
    render(<PaymentSection />)
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeInTheDocument()
    expect(screen.getByText('Credit / Debit Card')).toBeInTheDocument()
    expect(screen.getByText('UPI')).toBeInTheDocument()
    expect(screen.getByText('Cash on Delivery')).toBeInTheDocument()
  })

  it('states plainly that no real payment can be taken yet', () => {
    render(<PaymentSection />)
    expect(screen.getByText(/does not yet support order placement or payment processing/i)).toBeInTheDocument()
  })
})

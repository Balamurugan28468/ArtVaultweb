import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentMethodSelector } from './PaymentMethodSelector'

describe('PaymentMethodSelector', () => {
  it('renders Card, UPI, and Cash on Delivery, all as genuinely disabled controls', () => {
    render(<PaymentMethodSelector />)

    for (const label of ['Credit / Debit Card', 'UPI', 'Cash on Delivery']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    for (const radio of radios) {
      expect(radio).toBeDisabled()
      expect(radio).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('gives Card and UPI the same honest "connect a payment processor" copy', () => {
    render(<PaymentMethodSelector />)
    expect(
      screen.getAllByText('Online payment will be available when secure payment processing is connected.'),
    ).toHaveLength(2)
  })

  it('gives Cash on Delivery its own distinct honest explanation — no order-creation backend exists at all, not just no online-payment gateway', () => {
    render(<PaymentMethodSelector />)
    expect(screen.getByText(/order-creation backend is connected/i)).toBeInTheDocument()
  })

  it('never fabricates a transaction id, card form, or success state', () => {
    render(<PaymentMethodSelector />)
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/transaction/i)).not.toBeInTheDocument()
  })
})

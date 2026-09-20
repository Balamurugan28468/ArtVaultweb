import { render, screen } from '@testing-library/react'
import { Timestamp } from '@/lib/supabase/timestamp'
import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import { ReservationNotice } from './ReservationNotice'

describe('ReservationNotice', () => {
  it('does not infer a reservation or payment state for legacy orders', () => {
    const { container } = render(<ReservationNotice order={{} as Order} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('labels the amount as merchandise only and does not infer release from the clock', () => {
    render(<ReservationNotice order={{ pricingState: 'ITEMS_ONLY', reservationStatus: 'ACTIVE', reservationExpiresAt: Timestamp.fromMillis(1) } as unknown as Order} />)
    expect(screen.getByRole('status')).toHaveTextContent('Shipping and taxes are not priced')
    expect(screen.getByRole('status')).toHaveTextContent('Recorded reservation deadline')
    expect(screen.queryByText(/was released/)).not.toBeInTheDocument()
  })
  it('shows expiry only when the stored order confirms release', () => {
    render(<ReservationNotice order={{ pricingState: 'ITEMS_ONLY', reservationStatus: 'RELEASED', cancellationReason: 'RESERVATION_EXPIRED' } as Order} />)
    expect(screen.getByRole('status')).toHaveTextContent('reservation was released')
    expect(screen.queryByText(/Recorded reservation deadline/)).not.toBeInTheDocument()
  })
})

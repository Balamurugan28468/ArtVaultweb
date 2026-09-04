import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SellerStatusCard } from './SellerStatusCard'
import type { SellerApplication } from '../types'

const now = Timestamp.now()

function buildApplication(overrides: Partial<SellerApplication> = {}): SellerApplication {
  return {
    uid: 'alice',
    status: 'PENDING',
    businessName: 'Alice Fine Art',
    description: 'desc',
    contactEmail: 'alice@example.com',
    appliedAt: now,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('SellerStatusCard', () => {
  it('shows a "pending review" message and never implies approval while PENDING', () => {
    render(
      <MemoryRouter>
        <SellerStatusCard application={buildApplication({ status: 'PENDING' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.getByText(/isn't automatic/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /seller studio/i })).not.toBeInTheDocument()
  })

  it('shows an approved message with a link to Seller Studio once APPROVED', () => {
    render(
      <MemoryRouter>
        <SellerStatusCard application={buildApplication({ status: 'APPROVED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to seller studio/i })).toHaveAttribute('href', '/seller-studio')
  })
})

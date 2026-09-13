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
    rejectionReason: null,
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

  it('shows the real rejection reason and no Seller Studio link once REJECTED — never a fabricated or generic excuse', () => {
    render(
      <MemoryRouter>
        <SellerStatusCard
          application={buildApplication({ status: 'REJECTED', rejectionReason: 'Portfolio does not meet our quality guidelines.' })}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Not approved')).toBeInTheDocument()
    expect(screen.getByText(/wasn't approved this time/i)).toBeInTheDocument()
    expect(screen.getByText(/Portfolio does not meet our quality guidelines\./)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /seller studio/i })).not.toBeInTheDocument()
  })

  it('never offers a reapply action for a REJECTED application — no such path exists', () => {
    render(
      <MemoryRouter>
        <SellerStatusCard application={buildApplication({ status: 'REJECTED', rejectionReason: 'x' })} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('handles a REJECTED application with no rejection reason gracefully — no "null"/"undefined" text', () => {
    render(
      <MemoryRouter>
        <SellerStatusCard application={buildApplication({ status: 'REJECTED', rejectionReason: null })} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/wasn't approved this time/i)).toBeInTheDocument()
    expect(screen.queryByText(/null|undefined/i)).not.toBeInTheDocument()
  })
})

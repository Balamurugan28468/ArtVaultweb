import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuctionStatusBadge } from './AuctionStatusBadge'

describe('AuctionStatusBadge', () => {
  it('shows "Upcoming" for SCHEDULED', () => {
    render(<AuctionStatusBadge status="SCHEDULED" />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('shows "Live" for LIVE', () => {
    render(<AuctionStatusBadge status="LIVE" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows "Ended" for ENDED', () => {
    render(<AuctionStatusBadge status="ENDED" />)
    expect(screen.getByText('Ended')).toBeInTheDocument()
  })
})

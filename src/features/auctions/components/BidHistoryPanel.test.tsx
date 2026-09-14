import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BidHistoryPanel } from './BidHistoryPanel'

describe('BidHistoryPanel', () => {
  it('shows an honest not-connected message — never a fabricated bid list', () => {
    render(<BidHistoryPanel />)
    expect(screen.getByText("Bid History isn't connected yet")).toBeInTheDocument()
  })

  it('shows "Live Bidding" heading for a LIVE auction — cosmetic only, still honest', () => {
    render(<BidHistoryPanel status="LIVE" />)
    expect(screen.getByText("Live Bidding isn't connected yet")).toBeInTheDocument()
  })
})

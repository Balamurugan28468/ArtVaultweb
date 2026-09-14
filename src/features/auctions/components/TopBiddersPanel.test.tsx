import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TopBiddersPanel } from './TopBiddersPanel'

describe('TopBiddersPanel', () => {
  it('shows an honest "unavailable" message — never a fabricated bidder ranking', () => {
    render(<TopBiddersPanel />)
    expect(screen.getByText('Bid ranking unavailable')).toBeInTheDocument()
  })
})

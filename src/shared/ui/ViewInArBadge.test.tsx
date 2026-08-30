import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ViewInArBadge } from './ViewInArBadge'

describe('ViewInArBadge', () => {
  it('renders an honest inert state, not a working action', () => {
    render(<ViewInArBadge />)
    const badge = screen.getByText('View in AR')
    expect(badge).toHaveAttribute('aria-disabled', 'true')
    expect(badge).toHaveAttribute('title', expect.stringMatching(/later module/i))
  })
})

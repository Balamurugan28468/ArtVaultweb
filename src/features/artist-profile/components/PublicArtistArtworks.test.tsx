import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PublicArtistArtworks } from './PublicArtistArtworks'

describe('PublicArtistArtworks', () => {
  it('shows an honest empty state — no artwork lifecycle state is public yet', () => {
    render(<PublicArtistArtworks />)
    expect(screen.getByText('No public artworks yet')).toBeInTheDocument()
  })

  it('never renders any seller-management control', () => {
    render(<PublicArtistArtworks />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

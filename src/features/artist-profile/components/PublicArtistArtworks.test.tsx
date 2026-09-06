import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PublicArtistArtworks } from './PublicArtistArtworks'

const PublicArtworkGrid = vi.fn()
vi.mock('@/features/artwork', () => ({
  PublicArtworkGrid: (props: { sellerId: string }) => PublicArtworkGrid(props),
}))

describe('PublicArtistArtworks', () => {
  it('delegates to PublicArtworkGrid with the given artistId as sellerId — never hardcoded', () => {
    PublicArtworkGrid.mockReturnValueOnce(<p>grid for a given seller</p>)
    render(<PublicArtistArtworks artistId="alice" />)

    expect(PublicArtworkGrid).toHaveBeenCalledWith({ sellerId: 'alice' })
    expect(screen.getByText('grid for a given seller')).toBeInTheDocument()
  })

  it('passes a different artistId through unchanged for a different artist', () => {
    PublicArtworkGrid.mockReturnValueOnce(<p>grid</p>)
    render(<PublicArtistArtworks artistId="bob" />)

    expect(PublicArtworkGrid).toHaveBeenCalledWith({ sellerId: 'bob' })
  })
})

import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ArtworkListItem } from './ArtworkListItem'
import type { Artwork } from '../types'

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 3,
    status: 'DRAFT',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('ArtworkListItem', () => {
  it('links to the edit page for this artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/seller-studio/artworks/a1/edit')
  })

  it('shows the whole-rupee price converted from stored paise', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ price: 150000 })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('₹1500')).toBeInTheDocument()
  })

  it('shows a Draft badge for a DRAFT artwork and a Submitted badge for a SUBMITTED one', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'DRAFT' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUBMITTED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })
})

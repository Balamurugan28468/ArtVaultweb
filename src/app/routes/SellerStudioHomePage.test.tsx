import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SellerStudioHomePage } from './SellerStudioHomePage'

describe('SellerStudioHomePage', () => {
  it('links to My Artworks, Create Artwork, and the public profile page', () => {
    render(
      <MemoryRouter>
        <SellerStudioHomePage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'My Artworks' })).toHaveAttribute('href', '/seller-studio/artworks')
    expect(screen.getByRole('link', { name: 'Create Artwork' })).toHaveAttribute('href', '/seller-studio/artworks/new')
    expect(screen.getByRole('link', { name: 'Public Profile' })).toHaveAttribute('href', '/seller-studio/profile')
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SellerStudioShell } from './SellerStudioShell'

function renderShell(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SellerStudioShell title="Test">Content</SellerStudioShell>
    </MemoryRouter>,
  )
}

describe('SellerStudioShell', () => {
  it('renders the real sub-nav links to every Seller Studio destination', () => {
    renderShell('/seller-studio')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/seller-studio')
    expect(screen.getByRole('link', { name: 'My Artworks' })).toHaveAttribute('href', '/seller-studio/artworks')
    expect(screen.getByRole('link', { name: 'Create Artwork' })).toHaveAttribute('href', '/seller-studio/artworks/new')
    expect(screen.getByRole('link', { name: 'Public Profile' })).toHaveAttribute('href', '/seller-studio/profile')
  })

  it('marks Dashboard active on /seller-studio', () => {
    renderShell('/seller-studio')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'My Artworks' })).not.toHaveAttribute('aria-current')
  })

  it('marks My Artworks active on /seller-studio/artworks', () => {
    renderShell('/seller-studio/artworks')
    expect(screen.getByRole('link', { name: 'My Artworks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  // Real regression this would otherwise risk: a naive prefix match
  // (pathname.startsWith('/seller-studio')) would make every tab "active"
  // on every Seller Studio page, since they all share that prefix.
  it('marks only Dashboard active on /seller-studio, never every tab at once', () => {
    renderShell('/seller-studio')
    const activeLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
  })

  // Create Artwork (/seller-studio/artworks/new) must never fight with My
  // Artworks (/seller-studio/artworks) for "active" on the same path —
  // only the Edit Artwork route nests under /artworks/, not /artworks/new.
  it('marks only Create Artwork active on the edit-artwork route, via prefix match on its own path', () => {
    renderShell('/seller-studio/artworks/abc123/edit')
    expect(screen.getByRole('link', { name: 'My Artworks' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Create Artwork' })).not.toHaveAttribute('aria-current')
  })

  it('marks Create Artwork active on /seller-studio/artworks/new itself', () => {
    renderShell('/seller-studio/artworks/new')
    expect(screen.getByRole('link', { name: 'Create Artwork' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders the provided title, description, actions, and children', () => {
    render(
      <MemoryRouter initialEntries={['/seller-studio']}>
        <SellerStudioShell title="My Title" description="My description" actions={<button type="button">Action</button>}>
          <p>Body content</p>
        </SellerStudioShell>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'My Title' })).toBeInTheDocument()
    expect(screen.getByText('My description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ArtistProfilePage } from './ArtistProfilePage'

const useArtistProfile = vi.fn()
const PublicArtistArtworks = vi.fn((_props: { artistId: string }) => <p>public artworks section</p>)
vi.mock('@/features/artist-profile', () => ({
  useArtistProfile: (...args: unknown[]) => useArtistProfile(...args),
  PublicArtistHeader: ({ profile }: { profile: { displayName: string } }) => <h1>{profile.displayName}</h1>,
  PublicArtistArtworks: (props: { artistId: string }) => PublicArtistArtworks(props),
}))

function renderPage(artistId = 'alice') {
  return render(
    <MemoryRouter initialEntries={[`/artists/${artistId}`]}>
      <Routes>
        <Route path="/artists/:artistId" element={<ArtistProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ArtistProfilePage', () => {
  it('shows a loading state', () => {
    useArtistProfile.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading artist profile')).toBeInTheDocument()
  })

  it('shows the public header and artworks section once loaded', () => {
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art' } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Alice Fine Art' })).toBeInTheDocument()
    expect(screen.getByText('public artworks section')).toBeInTheDocument()
  })

  it("passes the resolved profile's own uid to PublicArtistArtworks — never a hardcoded id", () => {
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art' } })
    renderPage('alice')
    expect(PublicArtistArtworks).toHaveBeenCalledWith({ artistId: 'alice' })
  })

  it('passes a different uid through unchanged for a different artist', () => {
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'bob', displayName: 'Bob Sculpture' } })
    renderPage('bob')
    expect(PublicArtistArtworks).toHaveBeenCalledWith({ artistId: 'bob' })
  })

  it('shows an honest not-found state for a nonexistent artist', () => {
    useArtistProfile.mockReturnValue({ status: 'missing' })
    renderPage('does-not-exist')
    expect(screen.getByText('Artist not found')).toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    useArtistProfile.mockReturnValue({ status: 'error', error: { message: 'Network unavailable.' } })
    renderPage()
    expect(screen.getByText("Couldn't load this artist profile")).toBeInTheDocument()
    expect(screen.getByText('Network unavailable.')).toBeInTheDocument()
  })

  it('works without requiring authentication — no sign-in redirect happens for this route', () => {
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art' } })
    renderPage()
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument()
  })

  // UI-01 visual rebuild — real Artworks/About tabs; Collections/Reviews
  // are honestly disabled, never a dead link (see this page's own comment).
  describe('tabs (UI-01)', () => {
    it('shows Artworks by default', () => {
      useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art', bio: 'Real bio.' } })
      renderPage()

      expect(screen.getByRole('tab', { name: 'Artworks', selected: true })).toBeInTheDocument()
      expect(screen.getByText('public artworks section')).toBeInTheDocument()
    })

    it('switches to About and shows the real bio', () => {
      useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art', bio: 'Real bio.' } })
      renderPage()

      fireEvent.click(screen.getByRole('tab', { name: 'About' }))
      expect(screen.getByText('Real bio.')).toBeInTheDocument()
      expect(screen.queryByText('public artworks section')).not.toBeInTheDocument()
    })

    it('Collections and Reviews are genuinely disabled — never a dead link', () => {
      useArtistProfile.mockReturnValue({ status: 'loaded', profile: { uid: 'alice', displayName: 'Alice Fine Art', bio: 'Real bio.' } })
      renderPage()

      expect(screen.getByRole('tab', { name: 'Collections' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('tab', { name: 'Reviews' })).toHaveAttribute('aria-disabled', 'true')
    })
  })
})

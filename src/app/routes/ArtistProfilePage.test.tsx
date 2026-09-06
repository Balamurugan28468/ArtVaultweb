import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ArtistProfilePage } from './ArtistProfilePage'

const useArtistProfile = vi.fn()
vi.mock('@/features/artist-profile', () => ({
  useArtistProfile: (...args: unknown[]) => useArtistProfile(...args),
  PublicArtistHeader: ({ profile }: { profile: { displayName: string } }) => <h1>{profile.displayName}</h1>,
  PublicArtistArtworks: () => <p>public artworks section</p>,
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
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { displayName: 'Alice Fine Art' } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Alice Fine Art' })).toBeInTheDocument()
    expect(screen.getByText('public artworks section')).toBeInTheDocument()
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
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { displayName: 'Alice Fine Art' } })
    renderPage()
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SellerProfilePage } from './SellerProfilePage'

// UI-03 — SellerStudioShell (rendered by every Seller Studio page,
// including this one) now has a real sub-nav of <Link>s plus useLocation(),
// so every render here needs a real Router context, same as every other
// route's own test file already provides.
function renderPage() {
  return render(
    <MemoryRouter>
      <SellerProfilePage />
    </MemoryRouter>,
  )
}

const useArtistProfile = vi.fn()
vi.mock('@/features/artist-profile', () => ({
  useArtistProfile: (...args: unknown[]) => useArtistProfile(...args),
  ArtistProfileEditForm: ({ profile }: { profile: { displayName: string } }) => (
    <form aria-label="edit public profile">{profile.displayName}</form>
  ),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'alice' } })
})

describe('SellerProfilePage', () => {
  it('shows the edit form once the profile is loaded', () => {
    useArtistProfile.mockReturnValue({ status: 'loaded', profile: { displayName: 'Alice Fine Art' } })
    renderPage()
    expect(screen.getByLabelText('edit public profile')).toHaveTextContent('Alice Fine Art')
  })

  it('subscribes using the signed-in seller\'s own uid, never an arbitrary one', () => {
    useArtistProfile.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(useArtistProfile).toHaveBeenCalledWith('alice')
  })

  it('shows a setup-in-progress message rather than a broken form when no profile exists yet', () => {
    useArtistProfile.mockReturnValue({ status: 'missing' })
    renderPage()
    expect(screen.getByText('Your public profile is being set up')).toBeInTheDocument()
    expect(screen.queryByLabelText('edit public profile')).not.toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    useArtistProfile.mockReturnValue({ status: 'error', error: { message: 'Network unavailable.' } })
    renderPage()
    expect(screen.getByText("Couldn't load your public profile")).toBeInTheDocument()
  })
})

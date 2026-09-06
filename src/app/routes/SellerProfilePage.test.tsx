import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SellerProfilePage } from './SellerProfilePage'

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
    render(<SellerProfilePage />)
    expect(screen.getByLabelText('edit public profile')).toHaveTextContent('Alice Fine Art')
  })

  it('subscribes using the signed-in seller\'s own uid, never an arbitrary one', () => {
    useArtistProfile.mockReturnValue({ status: 'loading' })
    render(<SellerProfilePage />)
    expect(useArtistProfile).toHaveBeenCalledWith('alice')
  })

  it('shows a setup-in-progress message rather than a broken form when no profile exists yet', () => {
    useArtistProfile.mockReturnValue({ status: 'missing' })
    render(<SellerProfilePage />)
    expect(screen.getByText('Your public profile is being set up')).toBeInTheDocument()
    expect(screen.queryByLabelText('edit public profile')).not.toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    useArtistProfile.mockReturnValue({ status: 'error', error: { message: 'Network unavailable.' } })
    render(<SellerProfilePage />)
    expect(screen.getByText("Couldn't load your public profile")).toBeInTheDocument()
  })
})

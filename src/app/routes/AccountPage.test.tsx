import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types'
import { AccountPage } from './AccountPage'

const useUserProfile = vi.fn()
vi.mock('@/features/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/account')>()
  return { ...actual, useUserProfile: () => useUserProfile() }
})
vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'alice' }, status: 'authenticated', role: 'CUSTOMER', refreshRole: vi.fn() }),
}))

const now = Timestamp.now()

const PROFILE: UserProfile = {
  uid: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Example',
  photoURL: null,
  role: 'CUSTOMER',
  phoneNumber: null,
  bio: null,
  profileCompleted: false,
  createdAt: now,
  updatedAt: now,
}

describe('AccountPage', () => {
  it('shows a loading skeleton while the profile is loading', () => {
    useUserProfile.mockReturnValue({ status: 'loading' })
    render(<AccountPage />)
    expect(screen.getByLabelText('Loading your account')).toBeInTheDocument()
  })

  it('shows an error state when the profile fails to load', () => {
    useUserProfile.mockReturnValue({
      status: 'error',
      error: { code: 'permission-denied', message: 'You do not have permission to do that.' },
    })
    render(<AccountPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to do that.')
  })

  it('shows an honest recovery state when no profile document exists', () => {
    useUserProfile.mockReturnValue({ status: 'missing' })
    render(<AccountPage />)
    expect(screen.getByText('No profile found')).toBeInTheDocument()
  })

  it('renders the account header and future sections once the profile is loaded', () => {
    useUserProfile.mockReturnValue({ status: 'loaded', profile: PROFILE })
    render(<AccountPage />)
    expect(screen.getByRole('heading', { name: 'Alice Example' })).toBeInTheDocument()
    expect(screen.getByText('More account features')).toBeInTheDocument()
  })
})

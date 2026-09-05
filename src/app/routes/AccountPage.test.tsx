import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
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
// AccountSections renders a real seller-status entry point — not this
// page's concern to test (see AccountSections.test.tsx) — stubbed to a
// fixed, safe state so these tests aren't coupled to seller-studio's
// realtime Firestore subscription.
vi.mock('@/features/seller-studio', () => ({ useSellerStatus: () => ({ status: 'not-applied' }) }))

function renderAccountPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  )
}

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
    renderAccountPage()
    expect(screen.getByLabelText('Loading your account')).toBeInTheDocument()
  })

  it('shows an error state when the profile fails to load', () => {
    useUserProfile.mockReturnValue({
      status: 'error',
      error: { code: 'permission-denied', message: 'You do not have permission to do that.' },
    })
    renderAccountPage()
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to do that.')
  })

  it('shows an honest recovery state when no profile document exists', () => {
    useUserProfile.mockReturnValue({ status: 'missing' })
    renderAccountPage()
    expect(screen.getByText('No profile found')).toBeInTheDocument()
  })

  it('shows a distinct, non-alarming state while a just-created profile is still being provisioned', () => {
    useUserProfile.mockReturnValue({ status: 'provisioning' })
    renderAccountPage()
    expect(screen.getByLabelText('Setting up your account')).toBeInTheDocument()
    expect(screen.queryByText('No profile found')).not.toBeInTheDocument()
  })

  it('renders the account header and future sections once the profile is loaded', () => {
    useUserProfile.mockReturnValue({ status: 'loaded', profile: PROFILE })
    renderAccountPage()
    expect(screen.getByRole('heading', { name: 'Alice Example' })).toBeInTheDocument()
    expect(screen.getByText('More account features')).toBeInTheDocument()
  })
})

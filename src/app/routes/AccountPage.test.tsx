import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/auth/types'
import { AccountPage } from './AccountPage'

const useUserProfile = vi.fn()

vi.mock('@/features/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/account')>()

  return {
    ...actual,
    useUserProfile: () => useUserProfile(),
  }
})

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'alice',
      email: 'alice@example.com',
    },
    status: 'authenticated',
    role: 'CUSTOMER',
    refreshRole: vi.fn(),
  }),
}))

// Seller status behavior is tested separately.
// Keep this test focused only on AccountPage.
vi.mock('@/features/seller-studio', () => ({
  useSellerStatus: () => ({
    status: 'not-applied',
  }),
}))

function renderAccountPage() {
  return render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>,
  )
}

const now = new Date().toISOString()

const PROFILE: UserProfile = {
  id: 'alice',
  uid: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Example',
  photoURL: null,
  photoPath: null,
  role: 'CUSTOMER',
  phoneNumber: null,
  bio: null,
  profileCompleted: false,
  createdAt: now,
  updatedAt: now,
}

describe('AccountPage', () => {
  it('shows a loading skeleton while the profile is loading', () => {
    useUserProfile.mockReturnValue({
      status: 'loading',
    })

    renderAccountPage()

    expect(screen.getByLabelText('Loading your account')).toBeInTheDocument()
  })

  it('shows an error state when the profile fails to load', () => {
    useUserProfile.mockReturnValue({
      status: 'error',
      error: {
        code: 'permission-denied',
        message: 'You do not have permission to do that.',
      },
    })

    renderAccountPage()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have permission to do that.',
    )
  })

  it('shows an honest recovery state when no profile exists', () => {
    useUserProfile.mockReturnValue({
      status: 'missing',
    })

    renderAccountPage()

    expect(screen.getByText('No profile found')).toBeInTheDocument()
  })

  it('shows a provisioning state while a new profile is being created', () => {
    useUserProfile.mockReturnValue({
      status: 'provisioning',
    })

    renderAccountPage()

    expect(screen.getByLabelText('Setting up your account')).toBeInTheDocument()
    expect(screen.queryByText('No profile found')).not.toBeInTheDocument()
  })

  it('renders the account header once the profile is loaded', () => {
    useUserProfile.mockReturnValue({
      status: 'loaded',
      profile: PROFILE,
    })

    renderAccountPage()

    expect(
      screen.getByRole('heading', {
        name: 'Alice Example',
      }),
    ).toBeInTheDocument()

    expect(screen.getByText('More account features')).toBeInTheDocument()
  })
})
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types'
import { AccountHeader } from './AccountHeader'

const useAuth = vi.fn()

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => useAuth(),
}))

beforeEach(() => {
  useAuth.mockReturnValue({
    user: {
      id: 'alice',
      email: 'alice@example.com',
    },
    status: 'authenticated',
    role: 'CUSTOMER',
    refreshRole: vi.fn(),
  })
})

const now = new Date().toISOString()

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'alice',
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice Example',
    phoneNumber: null,
    bio: null,
    photoPath: null,
    photoURL: null,
    role: 'CUSTOMER',
    profileCompleted: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('AccountHeader', () => {
  it('shows the display name, email, and role', () => {
    render(<AccountHeader profile={buildProfile()} />)

    expect(
      screen.getByRole('heading', {
        name: 'Alice Example',
      }),
    ).toBeInTheDocument()

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
  })

  it('shows an incomplete-profile hint when profileCompleted is false', () => {
    render(
      <AccountHeader
        profile={buildProfile({
          profileCompleted: false,
        })}
      />,
    )

    expect(screen.getByText(/complete your profile/i)).toBeInTheDocument()
  })

  it('shows a complete badge when profileCompleted is true', () => {
    render(
      <AccountHeader
        profile={buildProfile({
          profileCompleted: true,
        })}
      />,
    )

    expect(screen.getByText('Profile complete')).toBeInTheDocument()
  })

  it('falls back to email when displayName is missing', () => {
    render(
      <AccountHeader
        profile={buildProfile({
          displayName: null,
        })}
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: 'alice@example.com',
      }),
    ).toBeInTheDocument()
  })

  it('shows Admin when the authenticated role is ADMIN', () => {
    useAuth.mockReturnValue({
      user: {
        id: 'alice',
        email: 'alice@example.com',
      },
      status: 'authenticated',
      role: 'ADMIN',
      refreshRole: vi.fn(),
    })

    render(
      <AccountHeader
        profile={buildProfile({
          role: 'CUSTOMER',
        })}
      />,
    )

    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByText('Customer')).not.toBeInTheDocument()
  })

  it('shows Super Admin when the authenticated role is SUPER_ADMIN', () => {
    useAuth.mockReturnValue({
      user: {
        id: 'alice',
        email: 'alice@example.com',
      },
      status: 'authenticated',
      role: 'SUPER_ADMIN',
      refreshRole: vi.fn(),
    })

    render(
      <AccountHeader
        profile={buildProfile({
          role: 'CUSTOMER',
        })}
      />,
    )

    expect(screen.getByText('Super Admin')).toBeInTheDocument()
  })

  it('shows Seller when the authenticated role is SELLER', () => {
    useAuth.mockReturnValue({
      user: {
        id: 'alice',
        email: 'alice@example.com',
      },
      status: 'authenticated',
      role: 'SELLER',
      refreshRole: vi.fn(),
    })

    render(
      <AccountHeader
        profile={buildProfile({
          role: 'SELLER',
        })}
      />,
    )

    expect(screen.getByText('Seller')).toBeInTheDocument()
  })

  it('falls back to the profile role while the authenticated role has not resolved', () => {
    useAuth.mockReturnValue({
      user: {
        id: 'alice',
        email: 'alice@example.com',
      },
      status: 'authenticated',
      role: null,
      refreshRole: vi.fn(),
    })

    render(
      <AccountHeader
        profile={buildProfile({
          role: 'SELLER',
        })}
      />,
    )

    expect(screen.getByText('Seller')).toBeInTheDocument()
  })

  it('opens the edit profile modal from the Edit profile button', () => {
    render(<AccountHeader profile={buildProfile()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Edit profile',
      }),
    )

    expect(
      screen.getByRole('dialog', {
        name: 'Edit profile',
      }),
    ).toBeInTheDocument()
  })
})
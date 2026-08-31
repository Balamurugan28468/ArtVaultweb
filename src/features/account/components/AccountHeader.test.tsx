import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types'
import { AccountHeader } from './AccountHeader'

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'alice' }, status: 'authenticated', role: 'CUSTOMER', refreshRole: vi.fn() }),
}))

const now = Timestamp.now()

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
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
    ...overrides,
  }
}

describe('AccountHeader', () => {
  it('shows the display name, email, and role', () => {
    render(<AccountHeader profile={buildProfile()} />)
    expect(screen.getByRole('heading', { name: 'Alice Example' })).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
  })

  it('shows an incomplete-profile hint when profileCompleted is false', () => {
    render(<AccountHeader profile={buildProfile({ profileCompleted: false })} />)
    expect(screen.getByText(/complete your profile/i)).toBeInTheDocument()
  })

  it('shows a complete badge when profileCompleted is true', () => {
    render(<AccountHeader profile={buildProfile({ profileCompleted: true })} />)
    expect(screen.getByText('Profile complete')).toBeInTheDocument()
  })

  it('falls back to email when displayName is missing', () => {
    render(<AccountHeader profile={buildProfile({ displayName: null })} />)
    expect(screen.getByRole('heading', { name: 'alice@example.com' })).toBeInTheDocument()
  })

  it('opens the edit profile modal from the Edit profile button', () => {
    render(<AccountHeader profile={buildProfile()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument()
  })
})

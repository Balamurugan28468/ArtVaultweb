import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types'
import { AccountHeader } from './AccountHeader'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'alice' }, status: 'authenticated', role: 'CUSTOMER', refreshRole: vi.fn() })
})

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

  it('shows Admin for the real ADMIN claim even when the Firestore profile mirror is stale at CUSTOMER (the real defect this regression covers)', () => {
    useAuth.mockReturnValue({ user: { uid: 'alice' }, status: 'authenticated', role: 'ADMIN', refreshRole: vi.fn() })
    render(<AccountHeader profile={buildProfile({ role: 'CUSTOMER' })} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByText('Customer')).not.toBeInTheDocument()
  })

  it('shows Super Admin for the real SUPER_ADMIN claim', () => {
    useAuth.mockReturnValue({ user: { uid: 'alice' }, status: 'authenticated', role: 'SUPER_ADMIN', refreshRole: vi.fn() })
    render(<AccountHeader profile={buildProfile({ role: 'CUSTOMER' })} />)
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
  })

  it('shows Seller for the real SELLER claim', () => {
    useAuth.mockReturnValue({ user: { uid: 'alice' }, status: 'authenticated', role: 'SELLER', refreshRole: vi.fn() })
    render(<AccountHeader profile={buildProfile({ role: 'SELLER' })} />)
    expect(screen.getByText('Seller')).toBeInTheDocument()
  })

  it('falls back to the Firestore profile role in the narrow window before the claim has resolved', () => {
    useAuth.mockReturnValue({ user: { uid: 'alice' }, status: 'authenticated', role: null, refreshRole: vi.fn() })
    render(<AccountHeader profile={buildProfile({ role: 'SELLER' })} />)
    expect(screen.getByText('Seller')).toBeInTheDocument()
  })

  it('opens the edit profile modal from the Edit profile button', () => {
    render(<AccountHeader profile={buildProfile()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SecurityPage } from './SecurityPage'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => useAuth(),
}))

describe('SecurityPage', () => {
  it('renders account security dashboard, password update form, and sign out control', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1', email: 'alice@example.com' },
      role: 'CUSTOMER',
      signOut: vi.fn(),
    })

    render(
      <MemoryRouter>
        <SecurityPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Account Security')).toBeInTheDocument()
    expect(screen.getAllByText(/alice@example\.com/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: 'Update Password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Reset Link to Email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out of ArtVault' })).toBeInTheDocument()
  })
})

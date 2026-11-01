import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

const useUserProfile = vi.fn()
vi.mock('@/features/account', () => ({
  useUserProfile: () => useUserProfile(),
  updateUserProfile: vi.fn(),
}))

describe('SettingsPage', () => {
  it('renders profile and preferences settings', async () => {
    useUserProfile.mockReturnValue({
      status: 'loaded',
      profile: {
        uid: 'u1',
        displayName: 'Alice Example',
        bio: 'Art Collector & Curator',
        phoneNumber: '+91 9876543210',
      },
      updateProfile: vi.fn(),
      loading: false,
    })

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Account Settings')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Alice Example')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+91 9876543210')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Art Collector & Curator')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Profile' })).toBeInTheDocument()
  })
})

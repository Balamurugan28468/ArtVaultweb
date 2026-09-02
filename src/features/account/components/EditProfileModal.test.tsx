import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserProfile } from '@/features/auth/types'
import { EditProfileModal } from './EditProfileModal'

const updateUserProfile = vi.fn()
vi.mock('../api/profileRepository', () => ({
  updateUserProfile: (...args: unknown[]) => updateUserProfile(...args),
}))

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'alice' }, status: 'authenticated', role: 'CUSTOMER', refreshRole: vi.fn() }),
}))

const now = Timestamp.now()

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
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

beforeEach(() => {
  updateUserProfile.mockReset()
  vi.restoreAllMocks()
})

describe('EditProfileModal', () => {
  it('populates the form with the current profile values', () => {
    render(
      <EditProfileModal profile={buildProfile({ phoneNumber: '+1 555 0100', bio: 'Hi' })} open onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText('Display name')).toHaveValue('Alice')
    expect(screen.getByLabelText(/Phone number/)).toHaveValue('+1 555 0100')
    expect(screen.getByLabelText(/Bio/)).toHaveValue('Hi')
  })

  it('shows email and role as read-only', () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
    expect(screen.getByLabelText('Role')).toBeDisabled()
    expect(screen.getByLabelText('Role')).toHaveValue('Customer')
  })

  it('disables Save until the form is actually changed', () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled()
  })

  it('shows a specific "required" message for an empty display name', async () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText('Display name is required.')).toBeInTheDocument()
    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('shows a validation error and does not submit for a too-short display name', async () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument()
    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('clears the display-name error once the user corrects it', async () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await screen.findByText(/at least 2 characters/i)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })

    await waitFor(() => expect(screen.queryByText(/at least 2 characters/i)).not.toBeInTheDocument())
  })

  it('shows a validation error for an invalid phone number', async () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText(/Phone number/), { target: { value: 'not-a-phone!!' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/valid phone number/i)).toBeInTheDocument()
    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('accepts a valid phone number', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText(/Phone number/), { target: { value: '+1 555 0100' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled())
  })

  it('leaves the optional phone number empty without error', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateUserProfile).toHaveBeenCalledWith('alice', expect.objectContaining({ phoneNumber: null })))
  })

  it('shows a validation error for a too-long bio', async () => {
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText(/Bio/), { target: { value: 'x'.repeat(281) } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/exceed 280 characters/i)).toBeInTheDocument()
    expect(updateUserProfile).not.toHaveBeenCalled()
  })

  it('accepts a valid bio', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)
    fireEvent.input(screen.getByLabelText(/Bio/), { target: { value: 'Collector of contemporary sculpture.' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(updateUserProfile).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ bio: 'Collector of contemporary sculpture.' }),
      ),
    )
  })

  it('shows a live bio character count', () => {
    render(<EditProfileModal profile={buildProfile({ bio: 'Hello' })} open onClose={vi.fn()} />)
    expect(screen.getByText('5/280')).toBeInTheDocument()
    fireEvent.input(screen.getByLabelText(/Bio/), { target: { value: 'Hello world' } })
    expect(screen.getByText('11/280')).toBeInTheDocument()
  })

  it('saves successfully and closes the modal', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<EditProfileModal profile={buildProfile()} open onClose={onClose} />)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(updateUserProfile).toHaveBeenCalledWith('alice', {
      displayName: 'Alice Updated',
      phoneNumber: null,
      bio: null,
    })
  })

  it('shows an inline error and preserves entered values when the save fails', async () => {
    updateUserProfile.mockRejectedValueOnce({ code: 'unknown', message: 'Something went wrong. Please try again.' })
    const onClose = vi.fn()
    render(<EditProfileModal profile={buildProfile()} open onClose={onClose} />)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Display name')).toHaveValue('Alice Updated')
  })

  it('confirms before discarding unsaved changes on close', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    const onClose = vi.fn()
    render(<EditProfileModal profile={buildProfile()} open onClose={onClose} />)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(window.confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submits on Enter from within a text field, even though Save lives outside the <form>', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)

    const nameInput = screen.getByLabelText('Display name')
    fireEvent.input(nameInput, { target: { value: 'Alice Updated' } })
    fireEvent.submit(nameInput.closest('form') as HTMLFormElement)

    await waitFor(() => expect(updateUserProfile).toHaveBeenCalled())
  })

  it('treats a whitespace-only bio as empty rather than as saved whitespace', async () => {
    updateUserProfile.mockResolvedValueOnce(undefined)
    render(<EditProfileModal profile={buildProfile()} open onClose={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Updated' } })
    fireEvent.input(screen.getByLabelText(/Bio/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateUserProfile).toHaveBeenCalledWith('alice', expect.objectContaining({ bio: null })),
    )
  })

  it('closes without confirmation when the form is unchanged', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onClose = vi.fn()
    render(<EditProfileModal profile={buildProfile()} open onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

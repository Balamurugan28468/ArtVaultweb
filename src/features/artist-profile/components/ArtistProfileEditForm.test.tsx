import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtistProfileEditForm } from './ArtistProfileEditForm'
import type { ArtistProfile } from '../types'

const updateArtistProfile = vi.fn()
vi.mock('../api/artistProfileRepository', () => ({
  updateArtistProfile: (...args: unknown[]) => updateArtistProfile(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  updateArtistProfile.mockReset()
  useAuth.mockReturnValue({ user: { uid: 'alice' } })
})

const now = Timestamp.now()

function buildProfile(overrides: Partial<ArtistProfile> = {}): ArtistProfile {
  return { uid: 'alice', displayName: 'Alice Fine Art', bio: 'Oil paintings and prints.', createdAt: now, updatedAt: now, ...overrides }
}

describe('ArtistProfileEditForm', () => {
  it('prefills the form from the current profile', () => {
    render(<ArtistProfileEditForm profile={buildProfile()} onSaved={vi.fn()} />)
    expect(screen.getByLabelText('Display name')).toHaveValue('Alice Fine Art')
    expect(screen.getByLabelText('Public bio')).toHaveValue('Oil paintings and prints.')
  })

  it('saves the edited public fields and calls onSaved', async () => {
    updateArtistProfile.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    render(<ArtistProfileEditForm profile={buildProfile()} onSaved={onSaved} />)

    fireEvent.input(screen.getByLabelText('Display name'), { target: { value: 'Alice Fine Art Studio' } })
    fireEvent.click(screen.getByRole('button', { name: /save public profile/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(updateArtistProfile).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ displayName: 'Alice Fine Art Studio' }),
    )
  })

  it('shows a validation error instead of saving when the bio is cleared', async () => {
    render(<ArtistProfileEditForm profile={buildProfile()} onSaved={vi.fn()} />)

    fireEvent.input(screen.getByLabelText('Public bio'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save public profile/i }))

    expect(await screen.findByText('Bio is required.')).toBeInTheDocument()
    expect(updateArtistProfile).not.toHaveBeenCalled()
  })

  it('shows a safe server-error message on failure', async () => {
    updateArtistProfile.mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    render(<ArtistProfileEditForm profile={buildProfile()} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /save public profile/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to do that.')
  })

  it('disables Save while in flight, preventing duplicate submits', async () => {
    let resolveSave: () => void = () => {}
    updateArtistProfile.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveSave = resolve)))
    render(<ArtistProfileEditForm profile={buildProfile()} onSaved={vi.fn()} />)

    const saveButton = screen.getByRole('button', { name: /save public profile/i })
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())
    expect(updateArtistProfile).toHaveBeenCalledTimes(1)

    fireEvent.click(saveButton)
    expect(updateArtistProfile).toHaveBeenCalledTimes(1)

    resolveSave()
  })
})

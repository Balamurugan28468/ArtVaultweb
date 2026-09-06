import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { PublicArtistHeader } from './PublicArtistHeader'
import type { ArtistProfile } from '../types'

const now = Timestamp.now()

function buildProfile(overrides: Partial<ArtistProfile> = {}): ArtistProfile {
  return { uid: 'alice', displayName: 'Alice Fine Art', bio: 'Oil paintings and prints.', createdAt: now, updatedAt: now, ...overrides }
}

describe('PublicArtistHeader', () => {
  it('shows the display name and bio', () => {
    render(<PublicArtistHeader profile={buildProfile()} />)
    expect(screen.getByRole('heading', { name: 'Alice Fine Art' })).toBeInTheDocument()
    expect(screen.getByText('Oil paintings and prints.')).toBeInTheDocument()
  })

  it('never renders an edit/manage control — read-only by construction', () => {
    render(<PublicArtistHeader profile={buildProfile()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders initials from a two-word name when no photo is available', () => {
    render(<Avatar name="B. Balamurugan" />)
    expect(screen.getByText('BB')).toBeInTheDocument()
  })

  it('renders a single-letter fallback for a one-word name', () => {
    render(<Avatar name="Cher" />)
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('renders the photo instead of initials when photoURL is provided', () => {
    render(<Avatar name="Alice Example" photoURL="https://example.com/a.png" />)
    expect(screen.queryByText('AE')).not.toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/a.png')
  })

  it('falls back to initials when photoURL is null', () => {
    render(<Avatar name="Alice Example" photoURL={null} />)
    expect(screen.getByText('AE')).toBeInTheDocument()
  })
})

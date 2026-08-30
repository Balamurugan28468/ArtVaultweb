import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomePage } from '@/app/routes/HomePage'

describe('HomePage', () => {
  it('renders an honest welcome placeholder with no fake marketplace content', () => {
    render(<HomePage />)

    expect(screen.getByText('Welcome to ArtVault')).toBeInTheDocument()
    expect(screen.getByText(/will appear here as each module is built/i)).toBeInTheDocument()
  })
})

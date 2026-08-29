import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomePage } from '@/app/routes/HomePage'

describe('HomePage', () => {
  it('renders the foundation placeholder', () => {
    render(<HomePage />)

    expect(screen.getByText('ArtVault foundation is running')).toBeInTheDocument()
  })
})

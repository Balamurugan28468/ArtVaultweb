import { render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { router } from '@/app/routes/router'

describe('router', () => {
  it('renders the root layout and the home page at "/"', async () => {
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('ArtVault')).toBeInTheDocument()
    expect(await screen.findByText('ArtVault foundation is running')).toBeInTheDocument()
  })
})

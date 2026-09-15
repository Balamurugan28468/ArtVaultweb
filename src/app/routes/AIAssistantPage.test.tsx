import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AIAssistantPage } from './AIAssistantPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <AIAssistantPage />
    </MemoryRouter>,
  )
}

describe('AIAssistantPage', () => {
  it('renders the real heading and honest not-connected copy', () => {
    renderPage()
    expect(screen.getByText("Hello, I'm ArtVault AI")).toBeInTheDocument()
  })

  it('shows an honest "No saved conversations yet" state — never fabricated chat history', () => {
    renderPage()
    expect(screen.getByText('No saved conversations yet.')).toBeInTheDocument()
  })

  it('links real capability cards/sidebar items to their real existing destinations', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /Find Artworks/ })).toHaveAttribute('href', '/explore')
    expect(screen.getByRole('link', { name: /Explore Auctions/ })).toHaveAttribute('href', '/auctions')
    expect(screen.getByRole('link', { name: /Discover Art/ })).toHaveAttribute('href', '/explore')
    expect(screen.getByRole('link', { name: /Order & Support/ })).toHaveAttribute('href', '/orders')
  })

  it('disables sidebar/capability items with no real destination, with an honest explanation', () => {
    renderPage()
    expect(screen.getByText('Tips & Guides').closest('[aria-disabled="true"]')).not.toBeNull()
  })

  it('a suggested chip fills the real message input — a genuine action, never a fabricated AI reply', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Show me artworks under ₹5,000' }))
    expect(screen.getByLabelText('Message ArtVault AI')).toHaveValue('Show me artworks under ₹5,000')
  })

  it('Send is always disabled with an honest "not connected yet" explanation — never a fabricated reply', () => {
    renderPage()
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()
    expect(screen.getByText(/ArtVault AI isn't connected yet/)).toBeInTheDocument()
  })

  it('the message input itself is genuinely typeable — only sending is disabled', () => {
    renderPage()
    const input = screen.getByLabelText('Message ArtVault AI')
    expect(input).not.toBeDisabled()
    fireEvent.change(input, { target: { value: 'Hello' } })
    expect(input).toHaveValue('Hello')
  })

  describe('mobile navigation correction', () => {
    it('the permanent sidebar is desktop-only (hidden below lg), not stacked above the mobile content', () => {
      renderPage()
      const asides = document.getElementsByTagName('aside')
      expect(asides).toHaveLength(1)
      expect(asides[0]?.className).toContain('hidden')
      expect(asides[0]?.className).toContain('lg:flex')
    })

    it('shows a mobile-only menu button that opens a drawer with the same real sidebar content', () => {
      renderPage()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Open AI Assistant menu' }))

      const dialog = screen.getByRole('dialog', { name: 'AI Assistant' })
      expect(dialog).toBeInTheDocument()
      // Scoped to the dialog — the same real content also exists (CSS-hidden)
      // in the permanent desktop aside, so an unscoped query would match twice.
      expect(within(dialog).getByText('No saved conversations yet.')).toBeInTheDocument()
      expect(within(dialog).getByRole('link', { name: /Discover Art/ })).toHaveAttribute('href', '/explore')
    })

    it('closes the drawer after navigating to a real destination from it', () => {
      renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Open AI Assistant menu' }))
      const dialog = screen.getByRole('dialog', { name: 'AI Assistant' })
      fireEvent.click(within(dialog).getByRole('link', { name: /Discover Art/ }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

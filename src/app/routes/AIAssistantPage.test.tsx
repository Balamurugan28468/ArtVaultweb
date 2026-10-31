import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '@/features/ai/context/AssistantProvider'
import { AIAssistantPage } from './AIAssistantPage'

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))
vi.mock('@/features/ai/api/assistantRepository', () => ({ listAssistantHistory: vi.fn(), getAssistantConversation: vi.fn(), sendAssistantMessage: vi.fn() }))

function renderPage() {
  return render(
    <MemoryRouter>
      <AssistantProvider><AIAssistantPage /></AssistantProvider>
    </MemoryRouter>,
  )
}

describe('AIAssistantPage', () => {
  it('renders the real heading and honest FAQ disclosure', () => {
    renderPage()
    expect(screen.getByText("Hello, I'm ArtVault AI")).toBeInTheDocument()
    expect(screen.getByText(/Local FAQ guidance/)).toBeInTheDocument()
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

  it('makes Tips and Guides fill a real help question rather than inventing navigation', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Tips & Guides' }))
    expect(screen.getByLabelText('Message ArtVault AI')).toHaveValue('How do I use ArtVault?')
  })

  it('a suggested chip fills the real message input — a genuine action, never a fabricated AI reply', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Show me artworks under ₹5,000' }))
    expect(screen.getByLabelText('Message ArtVault AI')).toHaveValue('Show me artworks under ₹5,000')
  })

  it('Send is disabled for an empty question and enables for actual input', () => {
    renderPage()
    const sendButton = screen.getByRole('button', { name: 'Send' })
    expect(sendButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Message ArtVault AI'), { target: { value: 'How does checkout work?' } })
    expect(sendButton).toBeEnabled()
    expect(screen.getByText(/Local FAQ guidance/)).toBeInTheDocument()
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

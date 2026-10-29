import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AssistantProvider } from '../context/AssistantProvider'
import { AIAssistantLauncher } from './AIAssistantLauncher'

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))
vi.mock('../api/assistantRepository', () => ({ listAssistantHistory: vi.fn(), getAssistantConversation: vi.fn(), sendAssistantMessage: vi.fn() }))

function renderLauncher(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AssistantProvider><AIAssistantLauncher /></AssistantProvider>
    </MemoryRouter>,
  )
}

describe('AIAssistantLauncher', () => {
  it('renders as a real, enabled launcher — no longer a permanently disabled placeholder', () => {
    renderLauncher()
    const button = screen.getByRole('button', { name: 'ArtVault AI Assistant' })
    expect(button).not.toBeDisabled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens an honest panel on click, explicitly labeling local FAQ guidance', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))

    const dialog = screen.getByRole('dialog', { name: 'ArtVault AI' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/Local FAQ guidance/)).toBeInTheDocument()
  })

  it('enables the real composer without fabricating a response before Send', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))

    expect(screen.getByLabelText('Message ArtVault AI')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('log')).not.toHaveTextContent('ArtVault · FAQ')
    fireEvent.change(screen.getByLabelText('Message ArtVault AI'), { target: { value: 'How do auctions work?' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('shows a contextual "about this artwork" suggestion only when launched from an Artwork Detail page', () => {
    renderLauncher('/artworks/a1')
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask ArtVault AI about this artwork' }))
    expect(screen.getByLabelText('Message ArtVault AI')).toHaveValue('How do I open analysis and AR for an artwork?')
  })

  it('omits the artwork-context suggestion everywhere else', () => {
    renderLauncher('/explore')
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    expect(screen.queryByRole('button', { name: 'Ask ArtVault AI about this artwork' })).not.toBeInTheDocument()
  })

  it('links to the full AI Assistant page — the one genuinely working action in this panel (UI-05)', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    expect(screen.getByRole('link', { name: 'Open full AI Assistant →' })).toHaveAttribute('href', '/ai')
  })

  it('closes via the dialog\'s own close control', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('minimizes without losing the draft and remains available on short mobile screens', () => {
    renderLauncher()
    const launcher = screen.getByRole('button', { name: 'ArtVault AI Assistant' })
    expect(launcher.className).not.toContain('hidden')
    expect(launcher.className).toContain('safe-area-inset-bottom')
    fireEvent.click(launcher)
    fireEvent.change(screen.getByLabelText('Message ArtVault AI'), { target: { value: 'My question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize chat' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(launcher)
    expect(screen.getByLabelText('Message ArtVault AI')).toHaveValue('My question')
  })

  it('closes on Escape for keyboard users', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

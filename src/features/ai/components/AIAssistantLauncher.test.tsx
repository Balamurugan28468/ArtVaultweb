import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AIAssistantLauncher } from './AIAssistantLauncher'

function renderLauncher(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AIAssistantLauncher />
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

  it('opens an honest panel on click, explicitly stating the assistant is not connected yet', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))

    const dialog = screen.getByRole('dialog', { name: 'ArtVault AI' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/isn't connected yet/i)).toBeInTheDocument()
  })

  it('every suggested action and the composer are genuinely disabled — never a fake reply', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))

    for (const action of ['Recommend artwork', 'Find art by category', 'Explain this artist']) {
      expect(screen.getByRole('button', { name: action })).toBeDisabled()
    }
    expect(screen.getByLabelText('Message ArtVault AI')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.queryByText(/chat|assistant reply/i)).not.toBeInTheDocument()
  })

  it('shows a contextual "about this artwork" suggestion only when launched from an Artwork Detail page', () => {
    renderLauncher('/artworks/a1')
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    expect(screen.getByRole('button', { name: 'Ask ArtVault AI about this artwork' })).toBeDisabled()
  })

  it('omits the artwork-context suggestion everywhere else', () => {
    renderLauncher('/explore')
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    expect(screen.queryByRole('button', { name: 'Ask ArtVault AI about this artwork' })).not.toBeInTheDocument()
  })

  it('closes via the dialog\'s own close control', () => {
    renderLauncher()
    fireEvent.click(screen.getByRole('button', { name: 'ArtVault AI Assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

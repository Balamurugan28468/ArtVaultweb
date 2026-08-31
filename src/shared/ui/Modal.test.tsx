import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Test modal">
        content
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus into the dialog on open (the header Close button, first in DOM order)', async () => {
    render(
      <Modal open onClose={vi.fn()} title="Test modal">
        <button type="button">First</button>
      </Modal>,
    )
    expect(await screen.findByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Test modal">
        content
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Test modal">
        content
      </Modal>,
    )
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks background scroll while open and restores it on close', () => {
    const previousOverflow = document.body.style.overflow
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Test modal">
        content
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Test modal">
        content
      </Modal>,
    )
    expect(document.body.style.overflow).toBe(previousOverflow)
  })

  it('renders footer content outside the scrolling body region', () => {
    render(
      <Modal open onClose={vi.fn()} title="Test modal" footer={<button type="button">Footer action</button>}>
        content
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'Footer action' })).toBeInTheDocument()
  })

  it('renders no footer region when none is provided', () => {
    render(
      <Modal open onClose={vi.fn()} title="Test modal">
        content
      </Modal>,
    )
    expect(screen.queryByRole('button', { name: 'Footer action' })).not.toBeInTheDocument()
  })
})

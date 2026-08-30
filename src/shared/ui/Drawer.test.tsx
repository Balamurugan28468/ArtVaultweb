import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Drawer } from './Drawer'

describe('Drawer', () => {
  it('renders nothing when closed, and closes on Escape when open', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Drawer open={false} onClose={onClose} title="Menu">
        content
      </Drawer>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <Drawer open onClose={onClose} title="Menu">
        content
      </Drawer>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useWishlist = vi.fn()
vi.mock('../context/WishlistProvider', () => ({ useWishlist: () => useWishlist() }))

const { WishlistButton } = await import('./WishlistButton')

describe('WishlistButton', () => {
  it('shows an unsaved state: outline heart, aria-pressed false, "Save" label', () => {
    useWishlist.mockReturnValue({ isSaved: () => false, toggle: vi.fn() })
    render(<WishlistButton artworkId="a1" />)
    const button = screen.getByRole('button', { name: 'Save to wishlist' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a saved state: filled heart, aria-pressed true, "Remove" label', () => {
    useWishlist.mockReturnValue({ isSaved: () => true, toggle: vi.fn() })
    render(<WishlistButton artworkId="a1" />)
    const button = screen.getByRole('button', { name: 'Remove from wishlist' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('never relies on color alone: the icon fill attribute itself changes with saved state', () => {
    useWishlist.mockReturnValue({ isSaved: () => false, toggle: vi.fn() })
    const { rerender, container } = render(<WishlistButton artworkId="a1" />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none')

    useWishlist.mockReturnValue({ isSaved: () => true, toggle: vi.fn() })
    rerender(<WishlistButton artworkId="a1" />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('calls toggle with the artworkId on click', () => {
    const toggle = vi.fn()
    useWishlist.mockReturnValue({ isSaved: () => false, toggle })
    render(<WishlistButton artworkId="a7" />)
    fireEvent.click(screen.getByRole('button'))
    expect(toggle).toHaveBeenCalledWith('a7')
  })

  it('is keyboard-activatable — a real <button>, not a styled non-interactive element', () => {
    useWishlist.mockReturnValue({ isSaved: () => false, toggle: vi.fn() })
    render(<WishlistButton artworkId="a1" />)
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('stops click propagation so a wrapping <Link> to the artist page is not also triggered', () => {
    const toggle = vi.fn()
    useWishlist.mockReturnValue({ isSaved: () => false, toggle })
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <WishlistButton artworkId="a1" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(toggle).toHaveBeenCalled()
    expect(onParentClick).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useLike = vi.fn()
vi.mock('../hooks/useLike', () => ({ useLike: (...args: unknown[]) => useLike(...args) }))

const { LikeButton } = await import('./LikeButton')

describe('LikeButton', () => {
  it('shows an unliked state: outline star, aria-pressed false, "Like" label, real count', () => {
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={0} />)
    const button = screen.getByRole('button', { name: 'Like this artwork' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('0')
  })

  it('shows a liked state: filled star, aria-pressed true, "Unlike" label', () => {
    useLike.mockReturnValue({ liked: true, count: 3, pending: false, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={3} />)
    const button = screen.getByRole('button', { name: 'Unlike this artwork' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('3')
  })

  it('displays a zero count honestly — never hidden', () => {
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('displays a real positive count', () => {
    useLike.mockReturnValue({ liked: false, count: 128, pending: false, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={128} />)
    expect(screen.getByText('128')).toBeInTheDocument()
  })

  it('never relies on color alone: the star fill attribute itself changes with liked state', () => {
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle: vi.fn() })
    const { rerender, container } = render(<LikeButton artworkId="a1" likeCount={0} />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'none')

    useLike.mockReturnValue({ liked: true, count: 1, pending: false, toggle: vi.fn() })
    rerender(<LikeButton artworkId="a1" likeCount={0} />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('calls toggle on click', () => {
    const toggle = vi.fn()
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle })
    render(<LikeButton artworkId="a1" likeCount={0} />)
    fireEvent.click(screen.getByRole('button'))
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('is keyboard-activatable — a real <button>, not a styled non-interactive element', () => {
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={0} />)
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('is disabled while a write is pending, guarding against rapid duplicate activation', () => {
    useLike.mockReturnValue({ liked: false, count: 0, pending: true, toggle: vi.fn() })
    render(<LikeButton artworkId="a1" likeCount={0} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('stops click propagation so a wrapping/surrounding link is never accidentally triggered', () => {
    const toggle = vi.fn()
    useLike.mockReturnValue({ liked: false, count: 0, pending: false, toggle })
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <LikeButton artworkId="a1" likeCount={0} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(toggle).toHaveBeenCalled()
    expect(onParentClick).not.toHaveBeenCalled()
  })
})

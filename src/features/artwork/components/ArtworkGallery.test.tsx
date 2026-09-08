import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArtworkGallery } from './ArtworkGallery'
import type { ArtworkImage } from '../types'

function image(overrides: Partial<ArtworkImage> = {}): ArtworkImage {
  return {
    id: 'img1',
    path: 'artworks/alice/a1/img1.jpg',
    url: 'https://example.test/img1.jpg',
    order: 0,
    contentType: 'image/jpeg',
    size: 100,
    ...overrides,
  }
}

describe('ArtworkGallery', () => {
  it('shows a fallback with no crash when there are zero images', () => {
    render(<ArtworkGallery images={[]} title="Sunset" />)
    expect(screen.getByText('No image available')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('renders the single image as the primary image, with no thumbnail row, when there is exactly one', () => {
    render(<ArtworkGallery images={[image()]} title="Sunset" />)
    expect(screen.getByRole('img', { name: 'Sunset' })).toHaveAttribute('src', 'https://example.test/img1.jpg')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('uses the artwork title as the primary image alt text — it is content, not decoration', () => {
    render(<ArtworkGallery images={[image()]} title="Storm Over the Bay" />)
    expect(screen.getByAltText('Storm Over the Bay')).toBeInTheDocument()
  })

  it('sorts images by order and shows the first as the primary image, with a thumbnail per image', () => {
    render(
      <ArtworkGallery
        images={[image({ id: 'second', order: 1, url: 'https://example.test/second.jpg' }), image({ id: 'first', order: 0, url: 'https://example.test/first.jpg' })]}
        title="Sunset"
      />,
    )
    expect(screen.getByRole('img', { name: 'Sunset' })).toHaveAttribute('src', 'https://example.test/first.jpg')
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('switches the primary image when a thumbnail is clicked, with no autoplay/timer involved', () => {
    render(
      <ArtworkGallery
        images={[image({ id: 'a', order: 0, url: 'https://example.test/a.jpg' }), image({ id: 'b', order: 1, url: 'https://example.test/b.jpg' })]}
        title="Sunset"
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'View image 2 of 2' }))
    expect(screen.getByRole('img', { name: 'Sunset' })).toHaveAttribute('src', 'https://example.test/b.jpg')
    expect(screen.getByRole('tab', { name: 'View image 2 of 2' })).toHaveAttribute('aria-selected', 'true')
  })

  it('is keyboard-operable — ArrowRight/ArrowLeft move between images', () => {
    render(
      <ArtworkGallery
        images={[image({ id: 'a', order: 0, url: 'https://example.test/a.jpg' }), image({ id: 'b', order: 1, url: 'https://example.test/b.jpg' })]}
        title="Sunset"
      />,
    )
    const group = screen.getByRole('group')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByRole('img', { name: 'Sunset' })).toHaveAttribute('src', 'https://example.test/b.jpg')
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByRole('img', { name: 'Sunset' })).toHaveAttribute('src', 'https://example.test/a.jpg')
  })

  it('does not move past the first or last image on repeated arrow presses', () => {
    render(<ArtworkGallery images={[image({ id: 'a', order: 0 })]} title="Sunset" />)
    const group = screen.getByRole('group')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByRole('img', { name: 'Sunset' })).toBeInTheDocument()
  })

  it('falls back to a placeholder for the primary image when it fails to load, without breaking other thumbnails', () => {
    render(
      <ArtworkGallery
        images={[image({ id: 'a', order: 0, url: 'https://example.test/broken.jpg' }), image({ id: 'b', order: 1, url: 'https://example.test/b.jpg' })]}
        title="Sunset"
      />,
    )
    fireEvent.error(screen.getByRole('img', { name: 'Sunset' }))
    expect(screen.getByText('No image available')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'View image 2 of 2' })).toBeInTheDocument()
  })
})

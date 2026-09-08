import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDocumentMeta } from './useDocumentMeta'

function Probe({ title, description, image }: { title: string; description?: string; image?: string }) {
  useDocumentMeta({ title, description, image })
  return null
}

function metaContent(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute('content') ?? null
}

afterEach(() => {
  document.title = ''
  document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach((el) => el.remove())
})

describe('useDocumentMeta', () => {
  it('sets the document title and og/twitter title tags', () => {
    render(<Probe title="Sunset — ArtVault" />)
    expect(document.title).toBe('Sunset — ArtVault')
    expect(metaContent('meta[property="og:title"]')).toBe('Sunset — ArtVault')
    expect(metaContent('meta[name="twitter:title"]')).toBe('Sunset — ArtVault')
  })

  it('sets description and image tags only when truthfully provided', () => {
    render(<Probe title="Sunset — ArtVault" description="A real description." image="https://example.test/a.jpg" />)
    expect(metaContent('meta[property="og:description"]')).toBe('A real description.')
    expect(metaContent('meta[property="og:image"]')).toBe('https://example.test/a.jpg')
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image')
  })

  it('omits description/image tags entirely when not given, rather than writing an empty value', () => {
    render(<Probe title="Sunset — ArtVault" />)
    expect(document.head.querySelector('meta[property="og:description"]')).not.toBeInTheDocument()
    expect(document.head.querySelector('meta[property="og:image"]')).not.toBeInTheDocument()
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary')
  })

  it('restores the previous title and removes the tags it created on unmount', () => {
    document.title = 'ArtVault'
    const { unmount } = render(<Probe title="Sunset — ArtVault" />)
    expect(document.title).toBe('Sunset — ArtVault')
    unmount()
    expect(document.title).toBe('ArtVault')
    expect(document.head.querySelector('meta[property="og:title"]')).not.toBeInTheDocument()
  })
})

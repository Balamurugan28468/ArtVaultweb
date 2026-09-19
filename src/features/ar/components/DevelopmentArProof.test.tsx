import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'
import { DevelopmentArProof } from './DevelopmentArProof'

vi.mock('./ArtworkArViewer', () => ({ ArtworkArViewer: () => <p>Configured measured viewer</p> }))
const fetcher = vi.fn()
const version = 'a'.repeat(64)
const manifest = { artworkId: 'a1', imageId: 'front.jpg', widthMm: 400, heightMm: 200, includesFrame: false, version, modelUrl: `/__ar-proof/model/${version}.glb` }
const artwork = { id: 'a1', status: 'PUBLISHED', title: 'Measured work', images: [{ id: 'front.jpg', url: '/front.jpg' }] } as Artwork
function page(item = artwork) { return <DevelopmentArProof artwork={item}><p>Informational artwork fallback</p></DevelopmentArProof> }
beforeEach(() => { vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); vi.stubEnv('DEV', true) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('single artwork development gate', () => {
  it('preserves the original view when no operator proof exists', async () => {
    fetcher.mockResolvedValue({ ok: false })
    render(page())
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(screen.getByText('Informational artwork fallback')).toBeInTheDocument()
    expect(screen.queryByText('Configured measured viewer')).not.toBeInTheDocument()
  })
  it('loads only the matching manifest and restores the fallback after access is revoked', async () => {
    fetcher.mockResolvedValue({ ok: true, json: async () => manifest })
    render(page())
    await screen.findByText('Configured measured viewer')
    fetcher.mockResolvedValue({ ok: false })
    await act(async () => window.dispatchEvent(new Event('focus')))
    await screen.findByText('Informational artwork fallback')
    expect(screen.queryByText('Configured measured viewer')).not.toBeInTheDocument()
  })
  it('never enables an unrelated artwork using another manifest', async () => {
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ ...manifest, artworkId: 'other' }) })
    render(page())
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    expect(screen.getByText('Informational artwork fallback')).toBeInTheDocument()
  })
  it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'SUSPENDED'] as const)('never even requests a proof for %s', (status) => {
    render(page({ ...artwork, status }))
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByText('Informational artwork fallback')).toBeInTheDocument()
  })
  it('does not request or render local AR proof in a production build', () => {
    vi.stubEnv('DEV', false)
    render(page())
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.getByText('Informational artwork fallback')).toBeInTheDocument()
  })
})

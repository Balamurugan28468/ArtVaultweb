import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkArViewer } from './ArtworkArViewer'

const { release, activateAR, loadViewer } = vi.hoisted(() => ({ release: vi.fn((e: HTMLElement) => e.remove()), activateAR: vi.fn().mockResolvedValue(undefined), loadViewer: vi.fn() }))
vi.mock('../loadViewer', () => ({ loadViewer }))
class FakeViewer extends HTMLElement {
  loaded = false
  canActivateAR = false
  activateAR = activateAR
}
if (!customElements.get('model-viewer')) customElements.define('model-viewer', FakeViewer)
const version = 'a'.repeat(64)
const proof = { artworkId: 'a1', imageId: 'front.jpg', widthMm: 400, heightMm: 200, includesFrame: false, version, modelUrl: `/__ar-proof/model/${version}.glb` }
async function setup() {
  const rendered = render(<ArtworkArViewer proof={proof} title="Measured artwork" poster="/image.jpg" />)
  await waitFor(() => expect(rendered.container.querySelector('model-viewer')).not.toBeNull())
  return { ...rendered, element: rendered.container.querySelector('model-viewer') as unknown as FakeViewer }
}
beforeEach(() => { vi.clearAllMocks(); loadViewer.mockResolvedValue({ release }); activateAR.mockResolvedValue(undefined) })
describe('real AR viewer wrapper', () => {
  it('loads on demand and never enables an action before capability and model readiness', async () => {
    const { element } = await setup()
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('button', { name: 'View in your space' })).not.toBeInTheDocument()
    expect(element.getAttribute('ar-scale')).toBe('fixed')
    expect(element.getAttribute('ar-placement')).toBe('wall')
    expect(element.getAttribute('ar-modes')).toBe('webxr scene-viewer')
    act(() => { element.loaded = true; element.dispatchEvent(new Event('load')) })
    expect(screen.getByRole('status')).toHaveTextContent('3D preview, not camera placement')
  })
  it('launches the actual element API from the explicit click only', async () => {
    const { element } = await setup()
    act(() => { element.loaded = true; element.canActivateAR = true; element.dispatchEvent(new Event('load')) })
    expect(activateAR).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'View in your space' }))
    expect(activateAR).toHaveBeenCalledOnce()
  })
  it('keeps a real image fallback after model failure and releases the element on unmount', async () => {
    const { element, unmount } = await setup()
    act(() => element.dispatchEvent(new Event('error')))
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.getByAltText(/image fallback/)).toHaveAttribute('src', '/image.jpg')
    expect(screen.queryByRole('button', { name: 'View in your space' })).not.toBeInTheDocument()
    unmount()
    expect(release).toHaveBeenCalledWith(element)
  })
  it('reports launch rejection rather than reporting successful placement', async () => {
    const { element } = await setup()
    act(() => { element.loaded = true; element.canActivateAR = true; element.dispatchEvent(new Event('load')) })
    activateAR.mockRejectedValueOnce(new Error('permission denied'))
    fireEvent.click(screen.getByRole('button', { name: 'View in your space' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('could not start'))
  })
  it('handles a failed dependency load without a fake AR action', async () => {
    loadViewer.mockRejectedValueOnce(new Error('offline'))
    render(<ArtworkArViewer proof={proof} title="Artwork" />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('viewer could not load'))
    expect(screen.queryByRole('button', { name: 'View in your space' })).not.toBeInTheDocument()
  })
  it('retries a model failure with a fresh viewer and releases the failed instance', async () => {
    const { element, container } = await setup()
    act(() => element.dispatchEvent(new Event('error')))
    fireEvent.click(screen.getByRole('button', { name: 'Retry 3D preview' }))
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBe(element))
    expect(release).toHaveBeenCalledWith(element)
    const replacement = container.querySelector('model-viewer') as unknown as FakeViewer
    act(() => { replacement.loaded = true; replacement.dispatchEvent(new Event('load')) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3D preview, not camera placement')
  })
  it('retries a dependency download failure without reloading the page', async () => {
    loadViewer.mockRejectedValueOnce(new Error('offline'))
    const { container } = render(<ArtworkArViewer proof={proof} title="Artwork" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry 3D preview' }))
    await waitFor(() => expect(container.querySelector('model-viewer')).not.toBeNull())
    expect(loadViewer).toHaveBeenCalledTimes(2)
  })
  it('does not attach a viewer when lazy loading finishes after unmount', async () => {
    let resolve!: (value: { release: typeof release }) => void
    loadViewer.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { unmount } = render(<ArtworkArViewer proof={proof} title="Artwork" />)
    unmount()
    await act(async () => resolve({ release }))
    expect(document.querySelector('model-viewer')).toBeNull()
    expect(release).not.toHaveBeenCalled()
  })
})

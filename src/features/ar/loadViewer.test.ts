import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelViewerElement } from '@google/model-viewer'
import { loadViewer } from './loadViewer'

const { rendererKey, removeCachedModel, stopPresenting, Viewer } = vi.hoisted(() => ({
  rendererKey: Symbol('renderer'), removeCachedModel: vi.fn().mockResolvedValue(undefined),
  stopPresenting: vi.fn().mockResolvedValue(undefined), Viewer: class { static modelCacheSize = 5 },
}))
vi.mock('@google/model-viewer', () => ({ ModelViewerElement: Viewer }))
vi.mock('@google/model-viewer/lib/model-viewer-base.js', () => ({ $renderer: rendererKey }))
vi.mock('@google/model-viewer/lib/three-components/CachingGLTFLoader.js', () => ({ CachingGLTFLoader: { delete: removeCachedModel } }))

beforeEach(() => { vi.clearAllMocks() })
function element(loaded: boolean, ownSession: boolean) {
  const item = Object.assign(document.createElement('div'), { loaded, src: '/__ar-proof/model/version.glb' })
  item.setAttribute('src', item.src)
  Object.assign(item, { [rendererKey]: { arRenderer: { presentedScene: { element: ownSession ? item : document.createElement('div') }, stopPresenting } } })
  document.body.append(item)
  return item as unknown as ModelViewerElement
}
describe('pinned lazy viewer cleanup adapter', () => {
  it('evicts a failed source so retry cannot reuse the empty failed GLTF', async () => {
    const adapter = await loadViewer(), item = element(false, false)
    adapter.release(item)
    expect(removeCachedModel).toHaveBeenCalledExactlyOnceWith('/__ar-proof/model/version.glb')
    expect(item.hasAttribute('src')).toBe(false)
    expect(item.isConnected).toBe(false)
    expect(stopPresenting).not.toHaveBeenCalled()
  })
  it('ends only this element’s XR session and leaves loaded model disposal to the viewer', async () => {
    const adapter = await loadViewer(), item = element(true, true)
    adapter.release(item)
    expect(stopPresenting).toHaveBeenCalledOnce()
    expect(removeCachedModel).not.toHaveBeenCalled()
    expect(item.isConnected).toBe(false)
    expect(Viewer.modelCacheSize).toBe(0)
  })
  it('does not stop another viewer’s active session', async () => {
    const adapter = await loadViewer()
    adapter.release(element(true, false))
    expect(stopPresenting).not.toHaveBeenCalled()
  })
})

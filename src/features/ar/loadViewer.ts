import type { ModelViewerElement } from '@google/model-viewer'

/** Pinned integration seam; renderer access is solely for ending our session on unmount. */
export async function loadViewer() {
  const { ModelViewerElement } = await import('@google/model-viewer')
  const { $renderer } = await import('@google/model-viewer/lib/model-viewer-base.js')
  const { CachingGLTFLoader } = await import('@google/model-viewer/lib/three-components/CachingGLTFLoader.js')
  ModelViewerElement.modelCacheSize = 0
  return {
    release(element: ModelViewerElement) {
      const renderer = (element as unknown as Record<symbol, {
        arRenderer: { presentedScene?: { element: HTMLElement }; stopPresenting: () => Promise<void> }
      }>)[$renderer].arRenderer
      if (renderer.presentedScene?.element === element) void renderer.stopPresenting().catch(() => undefined)
      // 4.3.1 retains an empty GLTF after a failed fetch. Evict this failed
      // source only, so a retry actually downloads it again (not a cache hit).
      if (!element.loaded && element.src) void CachingGLTFLoader.delete(element.src).catch(() => undefined)
      element.removeAttribute('src')
      element.remove()
    },
  }
}

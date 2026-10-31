import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Unit/component tests must explicitly mock their network boundary. Never let
// an obsolete/incomplete mock reach a hosted project or open a real channel.
function blockNetwork() {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Unit tests must mock fetch; network access is disabled.'))))
  vi.stubGlobal('WebSocket', class {
    constructor() { throw new Error('Unit tests must mock WebSocket; network access is disabled.') }
  })
}
blockNetwork()
beforeEach(blockNetwork)

// `globals: false` in vite.config.ts means Testing Library's automatic
// cleanup (which self-registers only when it detects a *global* afterEach)
// never runs on its own — without this, renders from one test leak into
// the next test in the same file.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// `globals: false` in vite.config.ts means Testing Library's automatic
// cleanup (which self-registers only when it detects a *global* afterEach)
// never runs on its own — without this, renders from one test leak into
// the next test in the same file.
afterEach(() => {
  cleanup()
})

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResponsiveGrid } from './ResponsiveGrid'

// Regression coverage for a real, owner-caught incident: a 350px phone (an
// explicit owner test width) still rendered one giant full-width card
// because the mobile breakpoint threshold was 360px. jsdom doesn't evaluate
// media queries, so this can't assert an actual rendered column count —
// what it *can* prove is that the correct utility classes are present, at
// the correct (340px `xs`, not 360px) threshold, for every breakpoint the
// owner specified: <340:1, 340-767:2, 768-1279:3, 1280-1535:4, >=1536:5.
describe('ResponsiveGrid', () => {
  it('renders the exact owner-specified column classes at every breakpoint', () => {
    const { container } = render(
      <ResponsiveGrid>
        <div>one</div>
      </ResponsiveGrid>,
    )
    const grid = container.firstElementChild
    expect(grid?.className).toContain('grid-cols-1')
    expect(grid?.className).toContain('xs:grid-cols-2')
    expect(grid?.className).toContain('md:grid-cols-3')
    expect(grid?.className).toContain('xl:grid-cols-4')
    expect(grid?.className).toContain('2xl:grid-cols-5')
  })

  it('never uses the old 360px-era class name (sm:grid-cols-2) for the 2-column step', () => {
    const { container } = render(
      <ResponsiveGrid>
        <div>one</div>
      </ResponsiveGrid>,
    )
    const grid = container.firstElementChild
    expect(grid?.className).not.toContain('sm:grid-cols-2')
  })
})

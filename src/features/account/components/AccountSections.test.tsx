import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountSections } from './AccountSections'

describe('AccountSections', () => {
  it('renders every future section as a genuinely disabled, non-interactive control', () => {
    render(<AccountSections />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('does not render any real navigation links for unimplemented sections', () => {
    render(<AccountSections />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

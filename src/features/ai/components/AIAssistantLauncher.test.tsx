import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AIAssistantLauncher } from './AIAssistantLauncher'

describe('AIAssistantLauncher', () => {
  it('renders as a disabled, honestly-labeled affordance with no panel', () => {
    render(<AIAssistantLauncher />)

    const button = screen.getByRole('button', { name: /available in a later module/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/chat|assistant reply/i)).not.toBeInTheDocument()
  })
})

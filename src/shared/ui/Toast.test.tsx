import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster, useToast } from './Toast'

function Trigger() {
  const toast = useToast()
  return <button onClick={() => toast.success('Saved.')}>trigger</button>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  // useToastStore is a module-level singleton (zustand, not React state) —
  // flush every pending auto-dismiss so a toast pushed in one test can
  // never leak into the next.
  act(() => {
    vi.advanceTimersByTime(10_000)
  })
  vi.useRealTimers()
})

describe('Toast', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<Toaster />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a pushed toast', () => {
    render(
      <>
        <Trigger />
        <Toaster />
      </>,
    )
    fireEvent.click(screen.getByText('trigger'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it('auto-dismisses after its timeout, so it cannot sit indefinitely over fixed page chrome', () => {
    render(
      <>
        <Trigger />
        <Toaster />
      </>,
    )
    fireEvent.click(screen.getByText('trigger'))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('can still be dismissed manually before the auto-dismiss timeout', () => {
    render(
      <>
        <Trigger />
        <Toaster />
      </>,
    )
    fireEvent.click(screen.getByText('trigger'))

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModerationActionModal } from './ModerationActionModal'

function renderModal(overrides: Partial<Parameters<typeof ModerationActionModal>[0]> = {}) {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  render(
    <ModerationActionModal
      open
      onClose={onClose}
      title="Reject seller application"
      description="Alice Fine Art's application will be marked as rejected."
      requireReason
      confirmLabel="Reject application"
      isSubmitting={false}
      onConfirm={onConfirm}
      {...overrides}
    />,
  )
  return { onConfirm, onClose }
}

describe('ModerationActionModal — approve mode (no reason field)', () => {
  it('renders no reason field and confirms with no argument', () => {
    const { onConfirm } = renderModal({ requireReason: false, title: 'Approve seller application', confirmLabel: 'Approve' })

    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(onConfirm).toHaveBeenCalledWith()
  })
})

describe('ModerationActionModal — reject mode (reason required)', () => {
  it('blocks confirmation and shows an error for a blank reason', () => {
    const { onConfirm } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: /reject application/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/reason is required/i)
  })

  it('blocks confirmation for a whitespace-only reason', () => {
    const { onConfirm } = renderModal()

    fireEvent.input(screen.getByLabelText(/reason/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /reject application/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/reason is required/i)
  })

  it('blocks a reason longer than 500 characters after normalization', () => {
    const { onConfirm } = renderModal()

    fireEvent.input(screen.getByLabelText(/reason/i), { target: { value: 'x'.repeat(501) } })
    fireEvent.click(screen.getByRole('button', { name: /reject application/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/500 characters or fewer/i)
  })

  it('accepts a reason at exactly 500 characters', () => {
    const { onConfirm } = renderModal()

    fireEvent.input(screen.getByLabelText(/reason/i), { target: { value: 'x'.repeat(500) } })
    fireEvent.click(screen.getByRole('button', { name: /reject application/i }))

    expect(onConfirm).toHaveBeenCalledWith('x'.repeat(500))
  })

  it('trims and collapses internal whitespace before confirming', () => {
    const { onConfirm } = renderModal()

    fireEvent.input(screen.getByLabelText(/reason/i), { target: { value: '  Not   a fit.  ' } })
    fireEvent.click(screen.getByRole('button', { name: /reject application/i }))

    expect(onConfirm).toHaveBeenCalledWith('Not a fit.')
  })

  it('resets its own field when reopened, never leaking a previous reason into a new dialog', () => {
    const { rerender } = render(
      <ModerationActionModal
        open
        onClose={vi.fn()}
        title="Reject seller application"
        description="x"
        requireReason
        confirmLabel="Reject application"
        isSubmitting={false}
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.input(screen.getByLabelText(/reason/i), { target: { value: 'leftover text' } })

    rerender(
      <ModerationActionModal
        open={false}
        onClose={vi.fn()}
        title="Reject seller application"
        description="x"
        requireReason
        confirmLabel="Reject application"
        isSubmitting={false}
        onConfirm={vi.fn()}
      />,
    )
    rerender(
      <ModerationActionModal
        open
        onClose={vi.fn()}
        title="Reject seller application"
        description="x"
        requireReason
        confirmLabel="Reject application"
        isSubmitting={false}
        onConfirm={vi.fn()}
      />,
    )

    expect((screen.getByLabelText(/reason/i) as HTMLTextAreaElement).value).toBe('')
  })

  it('disables Confirm and Cancel while isSubmitting, and shows a working state', () => {
    renderModal({ isSubmitting: true })
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })
})

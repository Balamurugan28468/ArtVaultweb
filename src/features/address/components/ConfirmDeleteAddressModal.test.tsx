import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDeleteAddressModal } from './ConfirmDeleteAddressModal'

describe('ConfirmDeleteAddressModal', () => {
  it('names the address being deleted', () => {
    render(<ConfirmDeleteAddressModal open onClose={vi.fn()} onConfirm={vi.fn()} busy={false} addressName="Ada Lovelace" />)
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument()
  })

  it('calls onConfirm when Delete is clicked, and onClose when Cancel is clicked', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmDeleteAddressModal open onClose={onClose} onConfirm={onConfirm} busy={false} addressName="Ada Lovelace" />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both actions and shows "Deleting…" while busy', () => {
    render(<ConfirmDeleteAddressModal open onClose={vi.fn()} onConfirm={vi.fn()} busy addressName="Ada Lovelace" />)
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('renders nothing when closed', () => {
    render(<ConfirmDeleteAddressModal open={false} onClose={vi.fn()} onConfirm={vi.fn()} busy={false} addressName="Ada Lovelace" />)
    expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument()
  })
})

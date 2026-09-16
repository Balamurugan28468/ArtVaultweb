import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Address } from '../types'
import { AddressCard } from './AddressCard'

const ADDRESS: Address = {
  id: 'a1',
  fullName: 'Ada Lovelace',
  addressLine1: '12 Analytical Ave',
  addressLine2: 'Suite 2',
  city: 'London',
  state: 'London',
  postalCode: 'SW1A 1AA',
  country: 'UK',
  phone: '+44 20 1234 5678',
  isDefault: false,
  createdAt: null as never,
  updatedAt: null as never,
}

describe('AddressCard', () => {
  it('renders the full address and contact details', () => {
    render(<AddressCard address={ADDRESS} onEdit={vi.fn()} onDelete={vi.fn()} onSetDefault={vi.fn()} settingDefault={false} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('12 Analytical Ave, Suite 2')).toBeInTheDocument()
    expect(screen.getByText('London, London SW1A 1AA')).toBeInTheDocument()
    expect(screen.getByText('+44 20 1234 5678')).toBeInTheDocument()
  })

  it('shows a Default badge only when the address is the default', () => {
    const { rerender } = render(
      <AddressCard address={ADDRESS} onEdit={vi.fn()} onDelete={vi.fn()} onSetDefault={vi.fn()} settingDefault={false} />,
    )
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set Default' })).toBeInTheDocument()

    rerender(
      <AddressCard
        address={{ ...ADDRESS, isDefault: true }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
        settingDefault={false}
      />,
    )
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set Default' })).not.toBeInTheDocument()
  })

  it('calls onEdit, onDelete, and onSetDefault when their buttons are clicked', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onSetDefault = vi.fn()
    render(<AddressCard address={ADDRESS} onEdit={onEdit} onDelete={onDelete} onSetDefault={onSetDefault} settingDefault={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set Default' }))

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onSetDefault).toHaveBeenCalledTimes(1)
  })

  it('shows "Setting…" and disables the button while settingDefault is true', () => {
    render(<AddressCard address={ADDRESS} onEdit={vi.fn()} onDelete={vi.fn()} onSetDefault={vi.fn()} settingDefault />)
    expect(screen.getByRole('button', { name: 'Setting…' })).toBeDisabled()
  })
})

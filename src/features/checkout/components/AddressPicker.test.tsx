import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Address } from '@/features/address'
import { AddressPicker } from './AddressPicker'

const useAddresses = vi.fn()
vi.mock('@/features/address', () => ({
  useAddresses: () => useAddresses(),
  AddressFormModal: ({ open }: { open: boolean }) => (open ? <p>Add Address Modal</p> : null),
}))

function buildAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'a1',
    fullName: 'Ada Lovelace',
    addressLine1: '12 Analytical Ave',
    addressLine2: '',
    city: 'London',
    state: 'London',
    postalCode: 'SW1A 1AA',
    country: 'UK',
    phone: '',
    isDefault: false,
    createdAt: null as never,
    updatedAt: null as never,
    ...overrides,
  }
}

describe('AddressPicker', () => {
  it('falls back to the plain ShippingAddressForm when there are no saved addresses', () => {
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [] })
    const onChange = vi.fn()
    render(<AddressPicker onChange={onChange} />)

    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByText(/saving addresses for future orders isn't connected yet/i)).toBeInTheDocument()
  })

  it('falls back to the plain form when the address list fails to load — never blocks checkout', () => {
    useAddresses.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    render(<AddressPicker onChange={vi.fn()} />)
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
  })

  it('shows a picker with every saved address and identifies the Default one', () => {
    useAddresses.mockReturnValue({
      status: 'loaded',
      addresses: [buildAddress({ id: 'a1', isDefault: true }), buildAddress({ id: 'a2', fullName: 'Bob Bell' })],
    })
    render(<AddressPicker onChange={vi.fn()} />)

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Bob Bell')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
  })

  it('auto-selects the Default saved address and reports it as complete', () => {
    useAddresses.mockReturnValue({
      status: 'loaded',
      addresses: [buildAddress({ id: 'a1' }), buildAddress({ id: 'a2', fullName: 'Bob Bell', isDefault: true })],
    })
    const onChange = vi.fn()
    render(<AddressPicker onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Bob Bell' }), true)
  })

  it('switches selection and re-reports onChange when a different saved address is picked', () => {
    useAddresses.mockReturnValue({
      status: 'loaded',
      addresses: [buildAddress({ id: 'a1', isDefault: true }), buildAddress({ id: 'a2', fullName: 'Bob Bell' })],
    })
    const onChange = vi.fn()
    render(<AddressPicker onChange={onChange} />)

    fireEvent.click(screen.getByLabelText(/Bob Bell/))

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fullName: 'Bob Bell' }), true)
  })

  it('switches to a one-off address for this order without touching any saved address, and can switch back', () => {
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [buildAddress()] })
    render(<AddressPicker onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use a different address for this order' }))
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use a saved address instead' }))
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('opens the Add Address modal from the picker', () => {
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [buildAddress()] })
    render(<AddressPicker onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add new address' }))
    expect(screen.getByText('Add Address Modal')).toBeInTheDocument()
  })
})

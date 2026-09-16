import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from '../types'
import { AddressFormModal } from './AddressFormModal'

const addAddress = vi.fn()
const updateAddress = vi.fn()
vi.mock('../api/addressRepository', () => ({
  addAddress: (...args: unknown[]) => addAddress(...args),
  updateAddress: (...args: unknown[]) => updateAddress(...args),
  toAddressError: (error: unknown) =>
    error && typeof error === 'object' && 'code' in error
      ? error
      : { code: 'unknown', message: 'Something went wrong. Please try again.' },
}))

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'alice' }, status: 'authenticated' }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => ({ success: toastSuccess, error: toastError }) }
})

const EXISTING: Address = {
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
}

beforeEach(() => {
  addAddress.mockReset()
  updateAddress.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('AddressFormModal', () => {
  it('titles itself "Add Address" and calls addAddress when no address is passed', async () => {
    addAddress.mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<AddressFormModal open onClose={onClose} existingIds={[]} />)

    expect(screen.getByRole('heading', { name: 'Add Address' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alice Rivera' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
    fireEvent.change(screen.getByLabelText('State / Province'), { target: { value: 'Maharashtra' } })
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '411001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    await waitFor(() => expect(addAddress).toHaveBeenCalledWith('alice', expect.objectContaining({ fullName: 'Alice Rivera' }), []))
    expect(toastSuccess).toHaveBeenCalledWith('Address added.')
    expect(onClose).toHaveBeenCalled()
  })

  it('titles itself "Edit Address", pre-fills, and calls updateAddress when an address is passed', async () => {
    updateAddress.mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<AddressFormModal open onClose={onClose} address={EXISTING} existingIds={['other1']} />)

    expect(screen.getByRole('heading', { name: 'Edit Address' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace')

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(updateAddress).toHaveBeenCalledWith('alice', 'a1', expect.objectContaining({ fullName: 'Ada Lovelace' }), [
        'other1',
      ]),
    )
    expect(toastSuccess).toHaveBeenCalledWith('Address updated.')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error toast and keeps the modal open when the write fails', async () => {
    addAddress.mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    const onClose = vi.fn()
    render(<AddressFormModal open onClose={onClose} existingIds={[]} />)

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alice Rivera' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
    fireEvent.change(screen.getByLabelText('State / Province'), { target: { value: 'Maharashtra' } })
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '411001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('You do not have permission to do that.'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

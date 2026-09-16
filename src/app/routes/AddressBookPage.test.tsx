import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address } from '@/features/address'

const useAddresses = vi.fn()
const deleteAddress = vi.fn()
const setDefaultAddress = vi.fn()
vi.mock('@/features/address', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/address')>()
  return { ...actual, useAddresses: () => useAddresses(), deleteAddress: (...a: unknown[]) => deleteAddress(...a), setDefaultAddress: (...a: unknown[]) => setDefaultAddress(...a) }
})

vi.mock('@/app/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'alice' }, status: 'authenticated' }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => ({ success: toastSuccess, error: toastError }) }
})

const { AddressBookPage } = await import('./AddressBookPage')

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

beforeEach(() => {
  useAddresses.mockReset()
  deleteAddress.mockReset()
  setDefaultAddress.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('AddressBookPage', () => {
  it('shows a loading state', () => {
    useAddresses.mockReturnValue({ status: 'loading' })
    render(<AddressBookPage />)
    expect(screen.getByLabelText('Loading addresses')).toBeInTheDocument()
  })

  it('shows an error state', () => {
    useAddresses.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    render(<AddressBookPage />)
    expect(screen.getByText("Couldn't load your addresses")).toBeInTheDocument()
  })

  it('shows an honest empty state with an Add Address action', () => {
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [] })
    render(<AddressBookPage />)
    expect(screen.getByText('No saved addresses yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add Address' }).length).toBeGreaterThan(0)
  })

  it('renders saved addresses, identifying the Default one', () => {
    useAddresses.mockReturnValue({
      status: 'loaded',
      addresses: [buildAddress({ id: 'a1', fullName: 'Ada Lovelace', isDefault: true }), buildAddress({ id: 'a2', fullName: 'Bob Bell' })],
    })
    render(<AddressBookPage />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Bob Bell')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('opens Add Address modal from the header CTA', () => {
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [] })
    render(<AddressBookPage />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Address' })[0])
    expect(screen.getByRole('heading', { name: 'Add Address' })).toBeInTheDocument()
  })

  it('requires confirmation before deleting, then calls deleteAddress', async () => {
    deleteAddress.mockResolvedValueOnce(undefined)
    useAddresses.mockReturnValue({ status: 'loaded', addresses: [buildAddress()] })
    render(<AddressBookPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete this address?')).toBeInTheDocument()
    expect(deleteAddress).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteAddress).toHaveBeenCalledWith('alice', 'a1'))
    expect(toastSuccess).toHaveBeenCalledWith('Address deleted.')
  })

  it('calls setDefaultAddress when "Set Default" is clicked, passing every other address id', async () => {
    setDefaultAddress.mockResolvedValueOnce(undefined)
    useAddresses.mockReturnValue({
      status: 'loaded',
      addresses: [buildAddress({ id: 'a1', isDefault: true }), buildAddress({ id: 'a2', fullName: 'Bob Bell' })],
    })
    render(<AddressBookPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Set Default' }))
    await waitFor(() => expect(setDefaultAddress).toHaveBeenCalledWith('alice', 'a2', ['a1']))
  })
})

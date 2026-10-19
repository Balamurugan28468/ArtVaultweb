import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { AddressPicker } from './AddressPicker'

const addAddress = vi.fn()
const subscribeAddresses = vi.fn()
let saved: Record<string, unknown>[] = []
let failRead = true
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'authenticated', user: { uid: 'buyer' } }) }))
vi.mock('@/features/address/api/addressRepository', () => ({
  addAddress: (...args: unknown[]) => addAddress(...args),
  updateAddress: vi.fn(),
  toAddressError: () => ({ code: 'unknown', message: 'Save failed' }),
  subscribeAddresses: (...args: unknown[]) => subscribeAddresses(...args),
}))
vi.mock('@/shared/ui', async importOriginal => ({
  ...await importOriginal<typeof import('@/shared/ui')>(),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
beforeEach(() => {
  saved = []; failRead = true; vi.clearAllMocks()
  subscribeAddresses.mockImplementation((_uid, next, error) => {
    if (failRead) error({ code: 'network', message: 'Read failed' })
    else next(saved)
    return vi.fn()
  })
  addAddress.mockImplementation(async (_uid, input) => {
    saved = [{ ...input, id: 'saved-new', createdAt: '', updatedAt: '' }]
    failRead = false
    return 'saved-new'
  })
})

it('exposes real save actions during read errors, validates, saves, re-reads and selects after remount', async () => {
  const selected = vi.fn()
  const onChange = vi.fn()
  const tree = <MemoryRouter><AddressPicker onChange={onChange} onSelectionChange={selected} /></MemoryRouter>
  const first = render(tree)
  expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
  expect(selected).toHaveBeenLastCalledWith(null)
  fireEvent.click(screen.getByRole('button', { name: 'Add new address' }))
  const dialog = within(screen.getByRole('dialog'))
  const save = dialog.getByRole('button', { name: 'Add Address' })
  expect(save).toBeVisible()
  fireEvent.click(save)
  await waitFor(() => expect(dialog.getByText('Full name is required.')).toBeVisible())
  expect(addAddress).not.toHaveBeenCalled()
  for (const [label, value] of [
    ['Full name', 'Test Buyer'], ['Address line 1', '10 Test Street'],
    ['City', 'Chennai'], ['State / Province', 'Tamil Nadu'], ['Postal code', '600001'], ['Country', 'India'],
  ]) fireEvent.change(dialog.getByLabelText(label), { target: { value } })
  fireEvent.click(save)
  await waitFor(() => expect(selected).toHaveBeenLastCalledWith('saved-new'))
  expect(addAddress).toHaveBeenCalledTimes(1)
  expect(addAddress).toHaveBeenCalledWith('buyer', expect.objectContaining({ fullName: 'Test Buyer', phone: '' }), [])
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fullName: 'Test Buyer' }), true)
  expect(screen.getByRole('radio')).toBeChecked()
  first.unmount()
  render(tree)
  await waitFor(() => expect(screen.getByRole('radio')).toBeChecked())
  expect(selected).toHaveBeenLastCalledWith('saved-new')
  expect(addAddress).toHaveBeenCalledTimes(1)
})

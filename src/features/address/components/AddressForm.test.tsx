import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddressForm } from './AddressForm'

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alice Rivera' } })
  fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '1 Main St' } })
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
  fireEvent.change(screen.getByLabelText('State / Province'), { target: { value: 'Maharashtra' } })
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '411001' } })
  // Country defaults to 'India', already valid.
}

describe('AddressForm', () => {
  it('does not call onSubmit when required fields are missing', () => {
    const onSubmit = vi.fn()
    render(<AddressForm submitLabel="Add Address" pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with the validated values plus isDefault once every required field is valid', async () => {
    const onSubmit = vi.fn()
    render(<AddressForm submitLabel="Add Address" pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Alice Rivera', city: 'Pune', postalCode: '411001', isDefault: false }),
      ),
    )
  })

  it('includes isDefault: true once the "Set as default address" checkbox is checked', async () => {
    const onSubmit = vi.fn()
    render(<AddressForm submitLabel="Add Address" pending={false} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByLabelText('Set as default address'))
    fireEvent.click(screen.getByRole('button', { name: 'Add Address' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true })))
  })

  it('pre-fills every field (including isDefault) from an existing address when editing', () => {
    render(
      <AddressForm
        initialAddress={{
          id: 'a1',
          fullName: 'Ada Lovelace',
          addressLine1: '12 Analytical Ave',
          addressLine2: '',
          city: 'London',
          state: 'London',
          postalCode: 'SW1A 1AA',
          country: 'UK',
          phone: '',
          isDefault: true,
          createdAt: null as never,
          updatedAt: null as never,
        }}
        submitLabel="Save Changes"
        pending={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText('Set as default address')).toBeChecked()
  })

  it('disables Save and shows "Saving…" while pending', () => {
    render(<AddressForm submitLabel="Add Address" pending onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<AddressForm submitLabel="Add Address" pending={false} onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

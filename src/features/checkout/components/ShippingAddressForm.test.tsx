import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShippingAddressForm } from './ShippingAddressForm'

describe('ShippingAddressForm', () => {
  it('reports isComplete: false until every required field is filled', () => {
    const onChange = vi.fn()
    render(<ShippingAddressForm onChange={onChange} />)

    // Initial mount fires once with the (empty) defaults.
    expect(onChange).toHaveBeenCalledWith(expect.anything(), false)
  })

  it('reports isComplete: true once every required field has a valid value', () => {
    const onChange = vi.fn()
    render(<ShippingAddressForm onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alice Rivera' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Pune' } })
    fireEvent.change(screen.getByLabelText('State / Province'), { target: { value: 'Maharashtra' } })
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '411001' } })
    // Country defaults to 'India', already valid.

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]
    expect(lastCall[1]).toBe(true)
    expect(lastCall[0]).toMatchObject({ fullName: 'Alice Rivera', city: 'Pune', postalCode: '411001' })
  })

  it('pre-fills full name and phone from the signed-in profile when provided', () => {
    render(<ShippingAddressForm defaultFullName="Alice Rivera" defaultPhone="+91 98765 43210" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Full name')).toHaveValue('Alice Rivera')
    expect(screen.getByLabelText('Phone (optional)')).toHaveValue('+91 98765 43210')
  })

  it('states plainly that the address is not saved for future orders — never invents persistence', () => {
    render(<ShippingAddressForm onChange={vi.fn()} />)
    expect(screen.getByText(/saving addresses for future orders isn't connected yet/i)).toBeInTheDocument()
  })
})

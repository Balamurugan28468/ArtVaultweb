import { describe, expect, it } from 'vitest'
import { shippingAddressSchema } from './schemas'

const VALID_ADDRESS = {
  fullName: 'Alice Rivera',
  addressLine1: '1 Main St',
  addressLine2: '',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'India',
  phone: '',
}

describe('shippingAddressSchema', () => {
  it('accepts a fully valid address', () => {
    expect(shippingAddressSchema.safeParse(VALID_ADDRESS).success).toBe(true)
  })

  it('accepts a valid address with no optional fields filled in', () => {
    const { addressLine2: _addressLine2, phone: _phone, ...required } = VALID_ADDRESS
    expect(shippingAddressSchema.safeParse(required).success).toBe(true)
  })

  it.each(['fullName', 'addressLine1', 'city', 'state', 'postalCode', 'country'])('rejects a missing required field: %s', (field) => {
    const result = shippingAddressSchema.safeParse({ ...VALID_ADDRESS, [field]: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a postal code that is too short to be real', () => {
    const result = shippingAddressSchema.safeParse({ ...VALID_ADDRESS, postalCode: '1' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid phone number when one is provided', () => {
    const result = shippingAddressSchema.safeParse({ ...VALID_ADDRESS, phone: 'not a phone number!!' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty phone number — it is optional', () => {
    expect(shippingAddressSchema.safeParse({ ...VALID_ADDRESS, phone: '' }).success).toBe(true)
  })
})

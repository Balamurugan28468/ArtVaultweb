import { describe, expect, it } from 'vitest'
import type { Address } from '../types'
import { deduplicateAddresses, getAddressSignature } from './deduplicateAddresses'

function makeAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 'addr-1',
    fullName: 'Jane Doe',
    addressLine1: '123 Art Lane',
    addressLine2: 'Apt 4B',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
    phone: '9876543210',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('deduplicateAddresses', () => {
  it('returns empty or single-item array unchanged', () => {
    expect(deduplicateAddresses([])).toEqual([])
    const single = [makeAddress()]
    expect(deduplicateAddresses(single)).toBe(single)
  })

  it('filters out exact duplicate address IDs', () => {
    const a1 = makeAddress({ id: 'addr-1' })
    const a2 = makeAddress({ id: 'addr-1' })
    const result = deduplicateAddresses([a1, a2])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('addr-1')
  })

  it('filters out duplicate addresses with different IDs but identical fields (case-insensitive & trimmed)', () => {
    const a1 = makeAddress({ id: 'addr-1', fullName: 'Jane Doe', addressLine1: '123 Art Lane ' })
    const a2 = makeAddress({ id: 'addr-2', fullName: '  jane doe', addressLine1: '123 art lane' })
    const result = deduplicateAddresses([a1, a2])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('addr-1')
  })

  it('promotes default address when a duplicate entry is marked default', () => {
    const nonDefault = makeAddress({ id: 'addr-1', isDefault: false })
    const defaultAddr = makeAddress({ id: 'addr-2', isDefault: true })
    const result = deduplicateAddresses([nonDefault, defaultAddr])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('addr-2')
    expect(result[0].isDefault).toBe(true)
  })

  it('preserves distinct addresses with different street lines or cities', () => {
    const a1 = makeAddress({ id: 'addr-1', addressLine1: '123 Art Lane' })
    const a2 = makeAddress({ id: 'addr-2', addressLine1: '456 Sculpture Way' })
    const result = deduplicateAddresses([a1, a2])
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('addr-1')
    expect(result[1].id).toBe('addr-2')
  })

  it('generates consistent signatures regardless of whitespace or casing', () => {
    const a1 = makeAddress({ fullName: 'Alice Smith  ', city: 'Delhi' })
    const a2 = makeAddress({ fullName: 'alice smith', city: ' DELHI ' })
    expect(getAddressSignature(a1)).toBe(getAddressSignature(a2))
  })
})


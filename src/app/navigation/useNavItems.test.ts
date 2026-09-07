import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNavItems } from './useNavItems'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

describe('useNavItems', () => {
  it('shows only guest-available items while loading (no premature role-gated links)', () => {
    useAuth.mockReturnValue({ status: 'loading', role: null })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home', 'marketplace', 'wishlist'])
  })

  it('shows only guest-available items when signed out (Wishlist, Module 09, is available to guests too)', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home', 'marketplace', 'wishlist'])
  })

  it('adds Account for an authenticated CUSTOMER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home', 'marketplace', 'wishlist', 'account'])
  })

  it('never renders a comingSoon item regardless of role (Marketplace/Wishlist are now genuinely available)', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.every((item) => ['home', 'marketplace', 'wishlist', 'account'].includes(item.id))).toBe(true)
  })

  it('adds Seller Studio (now available) for an authenticated SELLER, but not for a CUSTOMER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    const sellerItems = renderHook(() => useNavItems()).result.current.map((item) => item.id)
    expect(sellerItems).toContain('seller-studio')

    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    const customerItems = renderHook(() => useNavItems()).result.current.map((item) => item.id)
    expect(customerItems).not.toContain('seller-studio')
  })
})

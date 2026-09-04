import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNavItems } from './useNavItems'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

describe('useNavItems', () => {
  it('shows only guest-available items while loading (no premature role-gated links)', () => {
    useAuth.mockReturnValue({ status: 'loading', role: null })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home'])
  })

  it('shows only guest-available items when signed out', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home'])
  })

  it('adds Account for an authenticated CUSTOMER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.map((item) => item.id)).toEqual(['home', 'account'])
  })

  it('never renders a comingSoon item regardless of role', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    const { result } = renderHook(() => useNavItems())
    expect(result.current.every((item) => item.id === 'home' || item.id === 'account')).toBe(true)
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

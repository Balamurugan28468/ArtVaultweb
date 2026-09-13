import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMoreMenuItems, useNavItems } from './useNavItems'

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

  // UI-01 mobile correction: Categories was removed as a duplicate of
  // Explore's own category discovery — never rendered as a nav item again,
  // for any role (see navItems.ts and router.tsx's /categories redirect).
  it('never shows Categories as a nav item, for any role', () => {
    for (const role of ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as const) {
      useAuth.mockReturnValue({ status: 'authenticated', role })
      expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).not.toContain('categories')
    }
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).not.toContain('categories')
  })

  it('never renders a comingSoon item regardless of role (Marketplace/Wishlist/Admin are now genuinely available)', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    const { result } = renderHook(() => useNavItems())
    expect(
      result.current.every((item) => ['home', 'marketplace', 'wishlist', 'account', 'admin'].includes(item.id)),
    ).toBe(true)
  })

  it('adds Admin Control Center (now available, Module 13) for ADMIN and SUPER_ADMIN, but not for a CUSTOMER or SELLER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).toContain('admin')

    useAuth.mockReturnValue({ status: 'authenticated', role: 'SUPER_ADMIN' })
    expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).toContain('admin')

    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).not.toContain('admin')

    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    expect(renderHook(() => useNavItems()).result.current.map((item) => item.id)).not.toContain('admin')
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

// UI-01 mobile bottom-nav "More" menu — an exact, owner-specified, ordered
// set per role (see useNavItems.ts's own comment on why this isn't derived
// generically from "everything not in the primary row").
describe('useMoreMenuItems', () => {
  it('shows Auctions, Notifications, and Help for a guest', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    const { result } = renderHook(() => useMoreMenuItems())
    expect(result.current.map((item) => item.id)).toEqual(['auction', 'notifications', 'help'])
  })

  it('shows Auctions, Notifications, Cart, and Help for a CUSTOMER — never Seller Studio or Admin', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    const { result } = renderHook(() => useMoreMenuItems())
    expect(result.current.map((item) => item.id)).toEqual(['auction', 'notifications', 'cart', 'help'])
  })

  it('shows Auctions, Notifications, Cart, Seller Studio, and Help for a SELLER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    const { result } = renderHook(() => useMoreMenuItems())
    expect(result.current.map((item) => item.id)).toEqual(['auction', 'notifications', 'cart', 'seller-studio', 'help'])
  })

  it('shows Auctions, Notifications, Admin Control Center, and Help for ADMIN/SUPER_ADMIN — never Cart', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    expect(renderHook(() => useMoreMenuItems()).result.current.map((item) => item.id)).toEqual([
      'auction',
      'notifications',
      'admin',
      'help',
    ])

    useAuth.mockReturnValue({ status: 'authenticated', role: 'SUPER_ADMIN' })
    expect(renderHook(() => useMoreMenuItems()).result.current.map((item) => item.id)).toEqual([
      'auction',
      'notifications',
      'admin',
      'help',
    ])
  })

  it('never includes Categories', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    expect(renderHook(() => useMoreMenuItems()).result.current.map((item) => item.id)).not.toContain('categories')
  })
})

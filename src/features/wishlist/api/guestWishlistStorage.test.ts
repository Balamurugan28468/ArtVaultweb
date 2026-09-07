import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addGuestWishlistId,
  clearGuestWishlist,
  getGuestWishlistIds,
  hasShownGuestSaveToast,
  markGuestSaveToastShown,
  removeGuestWishlistId,
} from './guestWishlistStorage'

beforeEach(() => {
  localStorage.clear()
})

describe('guest wishlist storage', () => {
  it('starts empty', () => {
    expect(getGuestWishlistIds()).toEqual([])
  })

  it('adds an id and reads it back', () => {
    addGuestWishlistId('a1')
    expect(getGuestWishlistIds()).toEqual(['a1'])
  })

  it('never adds the same id twice', () => {
    addGuestWishlistId('a1')
    addGuestWishlistId('a1')
    expect(getGuestWishlistIds()).toEqual(['a1'])
  })

  it('removes an id', () => {
    addGuestWishlistId('a1')
    addGuestWishlistId('a2')
    removeGuestWishlistId('a1')
    expect(getGuestWishlistIds()).toEqual(['a2'])
  })

  it('removing a nonexistent id is a safe no-op', () => {
    addGuestWishlistId('a1')
    removeGuestWishlistId('does-not-exist')
    expect(getGuestWishlistIds()).toEqual(['a1'])
  })

  it('survives being read by a fresh call (simulates a page refresh)', () => {
    addGuestWishlistId('a1')
    addGuestWishlistId('a2')
    expect(getGuestWishlistIds()).toEqual(['a1', 'a2'])
  })

  it('clearGuestWishlist empties it', () => {
    addGuestWishlistId('a1')
    clearGuestWishlist()
    expect(getGuestWishlistIds()).toEqual([])
  })

  it('ignores malformed stored JSON rather than throwing', () => {
    localStorage.setItem('artvault:guestWishlist', 'not valid json')
    expect(getGuestWishlistIds()).toEqual([])
  })

  it('ignores a stored value that is not an array of strings', () => {
    localStorage.setItem('artvault:guestWishlist', JSON.stringify({ not: 'an array' }))
    expect(getGuestWishlistIds()).toEqual([])
  })

  it('never throws even when localStorage itself throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => getGuestWishlistIds()).not.toThrow()
    expect(getGuestWishlistIds()).toEqual([])
    spy.mockRestore()
  })

  it('the guest-save toast is shown at most once', () => {
    expect(hasShownGuestSaveToast()).toBe(false)
    markGuestSaveToastShown()
    expect(hasShownGuestSaveToast()).toBe(true)
  })
})

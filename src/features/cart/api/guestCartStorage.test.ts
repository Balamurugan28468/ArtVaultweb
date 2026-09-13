import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGuestCart, getGuestCartQuantities, removeGuestCartItem, setGuestCartItemQuantity } from './guestCartStorage'

beforeEach(() => {
  localStorage.clear()
})

describe('guest cart storage', () => {
  it('starts empty', () => {
    expect(getGuestCartQuantities()).toEqual(new Map())
  })

  it('sets a quantity and reads it back', () => {
    setGuestCartItemQuantity('a1', 2)
    expect(getGuestCartQuantities()).toEqual(new Map([['a1', 2]]))
  })

  it('overwrites the quantity for an id already in the cart', () => {
    setGuestCartItemQuantity('a1', 2)
    setGuestCartItemQuantity('a1', 5)
    expect(getGuestCartQuantities()).toEqual(new Map([['a1', 5]]))
  })

  it('clamps a quantity below 1 up to 1', () => {
    setGuestCartItemQuantity('a1', 0)
    expect(getGuestCartQuantities()).toEqual(new Map([['a1', 1]]))
  })

  it('clamps a quantity above the 99 ceiling down to 99', () => {
    setGuestCartItemQuantity('a1', 500)
    expect(getGuestCartQuantities()).toEqual(new Map([['a1', 99]]))
  })

  it('removes an item', () => {
    setGuestCartItemQuantity('a1', 1)
    setGuestCartItemQuantity('a2', 1)
    removeGuestCartItem('a1')
    expect(getGuestCartQuantities()).toEqual(new Map([['a2', 1]]))
  })

  it('removing a nonexistent id is a safe no-op', () => {
    setGuestCartItemQuantity('a1', 1)
    removeGuestCartItem('does-not-exist')
    expect(getGuestCartQuantities()).toEqual(new Map([['a1', 1]]))
  })

  it('clearGuestCart empties it', () => {
    setGuestCartItemQuantity('a1', 1)
    clearGuestCart()
    expect(getGuestCartQuantities()).toEqual(new Map())
  })

  it('ignores malformed stored JSON rather than throwing', () => {
    localStorage.setItem('artvault:guestCart', 'not valid json')
    expect(getGuestCartQuantities()).toEqual(new Map())
  })

  it('ignores a stored value that is not an object of id->quantity', () => {
    localStorage.setItem('artvault:guestCart', JSON.stringify(['a1', 'a2']))
    expect(getGuestCartQuantities()).toEqual(new Map())
  })

  it('ignores entries with a non-numeric or non-positive quantity', () => {
    localStorage.setItem('artvault:guestCart', JSON.stringify({ a1: 'two', a2: -3, a3: 2 }))
    expect(getGuestCartQuantities()).toEqual(new Map([['a3', 2]]))
  })

  it('never throws even when localStorage itself throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => getGuestCartQuantities()).not.toThrow()
    expect(getGuestCartQuantities()).toEqual(new Map())
    spy.mockRestore()
  })
})

import { describe, expect, it } from 'vitest'
import { availableInventory } from './stock'
describe('available stock', () => {
  it('treats legacy stock as physical and subtracts only recorded reservations', () => {
    expect(availableInventory({ inventoryCount: 3 })).toBe(3)
    expect(availableInventory({ inventoryCount: 3, reservedCount: 2 })).toBe(1)
    expect(availableInventory({ inventoryCount: 3, reservedCount: 3 })).toBe(0)
  })
  it('fails closed on malformed counters', () => {
    expect(availableInventory({ inventoryCount: 2, reservedCount: 4 })).toBe(0)
    expect(availableInventory({ inventoryCount: 2, reservedCount: NaN })).toBe(0)
  })
})

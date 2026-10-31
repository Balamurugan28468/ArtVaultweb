/** Physical inventory never includes a subtraction for an unpaid reservation. */
export function availableInventory(artwork: { inventoryCount: number; reservedCount?: number }): number {
  const reserved = artwork.reservedCount ?? 0
  if (!Number.isSafeInteger(artwork.inventoryCount) || !Number.isSafeInteger(reserved) || reserved < 0 || reserved > artwork.inventoryCount) return 0
  return artwork.inventoryCount - reserved
}

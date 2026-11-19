import type { Address } from '../types'

/**
 * Generates a normalized signature string representing an address's physical destination.
 */
export function getAddressSignature(address: Address): string {
  return [
    address.fullName.trim().toLowerCase(),
    address.addressLine1.trim().toLowerCase(),
    (address.addressLine2 ?? '').trim().toLowerCase(),
    address.city.trim().toLowerCase(),
    address.state.trim().toLowerCase(),
    address.postalCode.trim().toLowerCase(),
    address.country.trim().toLowerCase(),
    (address.phone ?? '').trim().toLowerCase(),
  ].join('|')
}

/**
 * Deduplicates saved addresses so each unique destination is shown only once.
 * Preserves the `isDefault` status if any duplicate has it enabled.
 * Does not mutate the input array or delete database rows.
 */
export function deduplicateAddresses(addresses: Address[]): Address[] {
  if (addresses.length <= 1) return addresses

  const result: Address[] = []
  const signatureIndexMap = new Map<string, number>()
  const seenIds = new Set<string>()

  for (const address of addresses) {
    if (seenIds.has(address.id)) continue
    seenIds.add(address.id)

    const signature = getAddressSignature(address)
    const existingIndex = signatureIndexMap.get(signature)

    if (existingIndex === undefined) {
      signatureIndexMap.set(signature, result.length)
      result.push(address)
    } else {
      // If the duplicate is marked as default and the existing one is not,
      // prefer the default record.
      if (address.isDefault && !result[existingIndex].isDefault) {
        result[existingIndex] = address
      }
    }
  }

  return result
}


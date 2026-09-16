import type { Timestamp } from 'firebase/firestore'
// Imports the concrete file, not the `@/features/checkout` barrel — the
// checkout feature will need to import *from* `@/features/address` (its
// new AddressPicker), and importing the checkout barrel here would make
// the two feature barrels import each other (same reasoning
// PublicArtworkCard already applies to WishlistButton).
import type { ShippingAddressFormValues } from '@/features/checkout/schemas'

/**
 * UI-06 — a real, persisted address book. Canonical shape of an
 * `addresses/{uid}/entries/{addressId}` Firestore document (see
 * firestore.rules). Reuses `ShippingAddressFormValues` (Checkout's own
 * field set — UI-02) for every real address field, rather than inventing
 * a second, parallel address shape: an owner-approved rule for this
 * module is "reuse the existing shipping-address schema... instead of
 * creating inconsistent duplicated validation." Only `isDefault` and the
 * two real timestamps are genuinely new here.
 */
export interface Address extends ShippingAddressFormValues {
  id: string
  isDefault: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** The subset of an Address a form actually collects — everything except the server-assigned id/timestamps. */
export type AddressInput = ShippingAddressFormValues & { isDefault: boolean }

export type AddressErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface AddressError {
  code: AddressErrorCode
  message: string
}

export function isAddressError(value: unknown): value is AddressError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type AddressListState =
  | { status: 'loading' }
  | { status: 'loaded'; addresses: Address[] }
  | { status: 'error'; error: AddressError }

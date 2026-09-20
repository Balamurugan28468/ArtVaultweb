import type { ShippingAddressFormValues } from '@/features/checkout/schemas'

/**
 * Persisted Supabase address record.
 *
 * PostgreSQL timestamptz fields are represented
 * by ISO timestamp strings in the browser.
 */
export interface Address
  extends ShippingAddressFormValues {
  id: string

  isDefault: boolean

  createdAt: string
  updatedAt: string
}

/**
 * Fields collected by the address form.
 *
 * id, createdAt and updatedAt are generated
 * by PostgreSQL / the server-side RPC.
 */
export type AddressInput =
  ShippingAddressFormValues & {
    isDefault: boolean
  }

export type AddressErrorCode =
  | 'permission-denied'
  | 'network'
  | 'unknown'

export interface AddressError {
  code: AddressErrorCode
  message: string
}

export function isAddressError(
  value: unknown,
): value is AddressError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  )
}

export type AddressListState =
  | {
      status: 'loading'
    }
  | {
      status: 'loaded'
      addresses: Address[]
    }
  | {
      status: 'error'
      error: AddressError
    }
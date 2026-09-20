import { createClient } from '@/lib/supabase/client'
import {
  dataError,
  observe,
  requireIdentity,
  result,
  rpc,
} from '@/lib/supabase/data'
import type {
  Address,
  AddressError,
  AddressInput,
} from '../types'

function getErrorCode(
  error: unknown,
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error
  ) {
    return String(error.code)
  }

  return ''
}

export function toAddressError(
  error: unknown,
): AddressError {
  const code = getErrorCode(error)

  if (
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'permission-denied'
  ) {
    return {
      code: 'permission-denied',
      message:
        'You do not have permission to do that.',
    }
  }

  if (
    error instanceof TypeError ||
    code === '57014' ||
    code === 'network' ||
    code === 'unavailable'
  ) {
    return {
      code: 'network',
      message:
        'Network unavailable. Check your connection and try again.',
    }
  }

  return {
    code: 'unknown',
    message:
      'Something went wrong. Please try again.',
  }
}

function stringValue(
  value: unknown,
): string {
  return typeof value === 'string'
    ? value
    : ''
}

function nullableStringValue(
  value: unknown,
): string {
  return typeof value === 'string'
    ? value
    : ''
}

function timestampValue(
  value: unknown,
): string {
  if (typeof value === 'string') {
    const date = new Date(value)

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return new Date().toISOString()
}

export function mapToAddress(
  data: Record<string, unknown>,
): Address | null {
  if (
    typeof data.id !== 'string' ||
    typeof data.full_name !== 'string' ||
    typeof data.address_line1 !== 'string'
  ) {
    return null
  }

  return {
    id: data.id,

    fullName:
      data.full_name,

    addressLine1:
      data.address_line1,

    addressLine2:
      nullableStringValue(
        data.address_line2,
      ),

    city:
      stringValue(data.city),

    state:
      stringValue(data.state),

    postalCode:
      stringValue(
        data.postal_code,
      ),

    country:
      stringValue(data.country),

    phone:
      nullableStringValue(
        data.phone,
      ),

    isDefault:
      data.is_default === true,

    createdAt:
      timestampValue(
        data.created_at,
      ),

    updatedAt:
      timestampValue(
        data.updated_at,
      ),
  }
}

async function readAddresses(
  uid: string,
): Promise<Address[]> {
  await requireIdentity(uid)

  const rows =
    (await result(
      createClient()
        .from('addresses')
        .select(
          `
            id,
            user_id,
            full_name,
            address_line1,
            address_line2,
            city,
            state,
            postal_code,
            country,
            phone,
            is_default,
            created_at,
            updated_at
          `,
        )
        .eq(
          'user_id',
          uid,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        ),
    )) ?? []

  return rows
    .map((row) =>
      mapToAddress(
        row as Record<
          string,
          unknown
        >,
      ),
    )
    .filter(
      (
        address,
      ): address is Address =>
        address !== null,
    )
}

export function subscribeAddresses(
  uid: string,
  onData: (
    addresses: Address[],
  ) => void,
  onError: (
    error: AddressError,
  ) => void,
): () => void {
  return observe(
    'addresses',

    `user_id=eq.${uid}`,

    () =>
      readAddresses(uid),

    onData,

    (error) => {
      onError(
        toAddressError(error),
      )
    },
  )
}

function addressPayload(
  input: AddressInput,
): Record<string, unknown> {
  return {
    fullName:
      input.fullName.trim(),

    addressLine1:
      input.addressLine1.trim(),

    addressLine2:
      input.addressLine2?.trim() ??
      '',

    city:
      input.city.trim(),

    state:
      input.state.trim(),

    postalCode:
      input.postalCode.trim(),

    country:
      input.country.trim(),

    phone:
      input.phone?.trim() ??
      '',

    isDefault:
      input.isDefault,
  }
}

export async function addAddress(
  uid: string,
  input: AddressInput,
  _existingIds: string[],
): Promise<string> {
  try {
    await requireIdentity(uid)

    const id =
      await rpc<string>(
        'save_address',
        {
          target: null,
          payload:
            addressPayload(
              input,
            ),
        },
      )

    if (
      typeof id !== 'string'
    ) {
      throw dataError(null)
    }

    return id
  } catch (error) {
    throw toAddressError(error)
  }
}

export async function updateAddress(
  uid: string,
  addressId: string,
  input: AddressInput,
  _otherIds: string[],
): Promise<void> {
  try {
    await requireIdentity(uid)

    await rpc(
      'save_address',
      {
        target:
          addressId,

        payload:
          addressPayload(
            input,
          ),
      },
    )
  } catch (error) {
    throw toAddressError(error)
  }
}

export async function setDefaultAddress(
  uid: string,
  addressId: string,
  _otherIds: string[],
): Promise<void> {
  try {
    await requireIdentity(uid)

    await rpc(
      'set_default_address',
      {
        target:
          addressId,
      },
    )
  } catch (error) {
    throw toAddressError(error)
  }
}

export async function deleteAddress(
  uid: string,
  addressId: string,
): Promise<void> {
  try {
    await requireIdentity(uid)

    await rpc(
      'delete_address',
      {
        target:
          addressId,
      },
    )
  } catch (error) {
    throw toAddressError(error)
  }
}
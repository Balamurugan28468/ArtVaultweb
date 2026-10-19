import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  observe: vi.fn(),
  requireIdentity: vi.fn(),
  result: vi.fn(),
  rpc: vi.fn(),

  dataError: vi.fn((error: unknown) => {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error
        ? String(error.code)
        : ''

    if (
      code === '42501' ||
      code === 'PGRST301' ||
      code === 'permission-denied'
    ) {
      return {
        code: 'permission-denied' as const,
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
        code: 'network' as const,
        message:
          'Network unavailable. Check your connection and try again.',
      }
    }

    return {
      code: 'unknown' as const,
      message:
        'Something went wrong. Please try again.',
    }
  }),
}))

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient:
      mocks.createClient,
  }),
)

vi.mock(
  '@/lib/supabase/data',
  () => ({
    dataError:
      mocks.dataError,

    observe:
      mocks.observe,

    requireIdentity:
      mocks.requireIdentity,

    result:
      mocks.result,

    rpc:
      mocks.rpc,
  }),
)

const {
  addAddress,
  deleteAddress,
  mapToAddress,
  setDefaultAddress,
  subscribeAddresses,
  toAddressError,
  updateAddress,
} = await import(
  './addressRepository'
)

const INPUT = {
  fullName:
    'Ada Lovelace',

  addressLine1:
    '12 Analytical Ave',

  addressLine2:
    '',

  city:
    'London',

  state:
    'London',

  postalCode:
    'SW1A 1AA',

  country:
    'UK',

  phone:
    '',

  isDefault:
    false,
}

const DATABASE_ROW = {
  id:
    'a1',

  user_id:
    'alice',

  full_name:
    'Ada Lovelace',

  address_line1:
    '12 Analytical Ave',

  address_line2:
    null,

  city:
    'London',

  state:
    'London',

  postal_code:
    'SW1A 1AA',

  country:
    'UK',

  phone:
    null,

  is_default:
    true,

  created_at:
    '2026-09-19T10:00:00.000Z',

  updated_at:
    '2026-09-19T11:00:00.000Z',
}

type QueryBuilder = {
  select: ReturnType<
    typeof vi.fn
  >

  eq: ReturnType<
    typeof vi.fn
  >

  order: ReturnType<
    typeof vi.fn
  >
}

function installAddressClient() {
  const builder =
    {} as QueryBuilder

  builder.select =
    vi.fn(
      () => builder,
    )

  builder.eq =
    vi.fn(
      () => builder,
    )

  builder.order =
    vi.fn(
      () => builder,
    )

  const from =
    vi.fn(
      () => builder,
    )

  mocks.createClient.mockReturnValue(
    {
      from,
    },
  )

  return {
    builder,
    from,
  }
}

beforeEach(() => {
  mocks.createClient.mockReset()
  mocks.observe.mockReset()
  mocks.requireIdentity.mockReset()
  mocks.result.mockReset()
  mocks.rpc.mockReset()
  mocks.dataError.mockClear()

  mocks.requireIdentity.mockResolvedValue(
    undefined,
  )
})

describe(
  'mapToAddress',
  () => {
    it(
      'maps a well-formed Supabase address row',
      () => {
        expect(
          mapToAddress(
            DATABASE_ROW,
          ),
        ).toEqual({
          id:
            'a1',

          fullName:
            'Ada Lovelace',

          addressLine1:
            '12 Analytical Ave',

          addressLine2:
            '',

          city:
            'London',

          state:
            'London',

          postalCode:
            'SW1A 1AA',

          country:
            'UK',

          phone:
            '',

          isDefault:
            true,

          createdAt:
            '2026-09-19T10:00:00.000Z',

          updatedAt:
            '2026-09-19T11:00:00.000Z',
        })
      },
    )

    it(
      'returns null when id is missing',
      () => {
        expect(
          mapToAddress({
            full_name:
              'Ada Lovelace',

            address_line1:
              '12 Analytical Ave',
          }),
        ).toBeNull()
      },
    )

    it(
      'returns null when full_name is missing',
      () => {
        expect(
          mapToAddress({
            id:
              'a1',

            address_line1:
              '12 Analytical Ave',
          }),
        ).toBeNull()
      },
    )

    it(
      'returns null when address_line1 is missing',
      () => {
        expect(
          mapToAddress({
            id:
              'a1',

            full_name:
              'Ada Lovelace',
          }),
        ).toBeNull()
      },
    )

    it(
      'returns null when required fields have invalid types',
      () => {
        expect(
          mapToAddress({
            id:
              'a1',

            full_name:
              123,

            address_line1:
              '12 Analytical Ave',
          }),
        ).toBeNull()
      },
    )

    it(
      'defaults optional text fields to empty strings',
      () => {
        const address =
          mapToAddress({
            id:
              'a1',

            full_name:
              'Ada',

            address_line1:
              '12 Analytical Ave',

            city:
              'London',

            state:
              'London',

            postal_code:
              'SW1A 1AA',

            country:
              'UK',

            is_default:
              false,

            created_at:
              '2026-09-19T10:00:00.000Z',

            updated_at:
              '2026-09-19T11:00:00.000Z',
          })

        expect(
          address,
        ).not.toBeNull()

        expect(
          address?.addressLine2,
        ).toBe('')

        expect(
          address?.phone,
        ).toBe('')
      },
    )

    it(
      'defaults isDefault to false unless the database value is true',
      () => {
        const address =
          mapToAddress({
            ...DATABASE_ROW,

            is_default:
              'yes',
          })

        expect(
          address?.isDefault,
        ).toBe(false)
      },
    )

    it(
      'normalizes valid PostgreSQL timestamp strings to ISO strings',
      () => {
        const address =
          mapToAddress({
            ...DATABASE_ROW,

            created_at:
              '2026-09-19T10:00:00Z',

            updated_at:
              '2026-09-19T11:30:00Z',
          })

        expect(
          address?.createdAt,
        ).toBe(
          '2026-09-19T10:00:00.000Z',
        )

        expect(
          address?.updatedAt,
        ).toBe(
          '2026-09-19T11:30:00.000Z',
        )
      },
    )
  },
)

describe(
  'subscribeAddresses',
  () => {
    it(
      'creates one Supabase realtime subscription for the signed-in user',
      () => {
        const unsubscribe =
          vi.fn()

        mocks.observe.mockReturnValue(
          unsubscribe,
        )

        const onData =
          vi.fn()

        const onError =
          vi.fn()

        const result =
          subscribeAddresses(
            'alice',
            onData,
            onError,
          )

        expect(
          mocks.observe,
        ).toHaveBeenCalledTimes(
          1,
        )

        expect(
          mocks.observe,
        ).toHaveBeenCalledWith(
          'addresses',
          'user_id=eq.alice',
          expect.any(
            Function,
          ),
          onData,
          expect.any(
            Function,
          ),
        )

        expect(
          result,
        ).toBe(
          unsubscribe,
        )
      },
    )

    it(
      'reads addresses from Supabase and maps database rows',
      async () => {
        const {
          builder,
          from,
        } =
          installAddressClient()

        mocks.result.mockResolvedValueOnce(
          [
            DATABASE_ROW,
          ],
        )

        let read:
          | (() =>
              Promise<
                unknown
              >)
          | undefined

        mocks.observe.mockImplementation(
          (
            _table: unknown,
            _filter: unknown,
            readFunction: () =>
              Promise<
                unknown
              >,
          ) => {
            read =
              readFunction

            return vi.fn()
          },
        )

        subscribeAddresses(
          'alice',
          vi.fn(),
          vi.fn(),
        )

        expect(
          read,
        ).toBeDefined()

        const addresses =
          await read?.()

        expect(
          mocks.requireIdentity,
        ).toHaveBeenCalledWith(
          'alice',
        )

        expect(
          from,
        ).toHaveBeenCalledWith(
          'addresses',
        )

        expect(
          builder.select,
        ).toHaveBeenCalledTimes(
          1,
        )

        expect(
          builder.eq,
        ).toHaveBeenCalledWith(
          'user_id',
          'alice',
        )

        expect(
          builder.order,
        ).toHaveBeenCalledWith(
          'created_at',
          {
            ascending:
              false,
          },
        )

        expect(
          addresses,
        ).toEqual([
          {
            id:
              'a1',

            fullName:
              'Ada Lovelace',

            addressLine1:
              '12 Analytical Ave',

            addressLine2:
              '',

            city:
              'London',

            state:
              'London',

            postalCode:
              'SW1A 1AA',

            country:
              'UK',

            phone:
              '',

            isDefault:
              true,

            createdAt:
              '2026-09-19T10:00:00.000Z',

            updatedAt:
              '2026-09-19T11:00:00.000Z',
          },
        ])
      },
    )

    it(
      'filters malformed Supabase rows',
      async () => {
        installAddressClient()

        mocks.result.mockResolvedValueOnce(
          [
            DATABASE_ROW,

            {
              id:
                'bad',

              full_name:
                'Broken row',
            },
          ],
        )

        let read:
          | (() =>
              Promise<
                unknown
              >)
          | undefined

        mocks.observe.mockImplementation(
          (
            _table: unknown,
            _filter: unknown,
            readFunction: () =>
              Promise<
                unknown
              >,
          ) => {
            read =
              readFunction

            return vi.fn()
          },
        )

        subscribeAddresses(
          'alice',
          vi.fn(),
          vi.fn(),
        )

        const addresses =
          await read?.()

        expect(
          addresses,
        ).toHaveLength(
          1,
        )

        expect(
          addresses,
        ).toEqual([
          expect.objectContaining({
            id:
              'a1',

            fullName:
              'Ada Lovelace',
          }),
        ])
      },
    )

    it(
      'returns an empty address list when Supabase returns null',
      async () => {
        installAddressClient()

        mocks.result.mockResolvedValueOnce(
          null,
        )

        let read:
          | (() =>
              Promise<
                unknown
              >)
          | undefined

        mocks.observe.mockImplementation(
          (
            _table: unknown,
            _filter: unknown,
            readFunction: () =>
              Promise<
                unknown
              >,
          ) => {
            read =
              readFunction

            return vi.fn()
          },
        )

        subscribeAddresses(
          'alice',
          vi.fn(),
          vi.fn(),
        )

        const addresses =
          await read?.()

        expect(
          addresses,
        ).toEqual(
          [],
        )
      },
    )

    it(
      'maps a realtime permission error',
      () => {
        mocks.observe.mockReturnValue(
          vi.fn(),
        )

        const onError =
          vi.fn()

        subscribeAddresses(
          'alice',
          vi.fn(),
          onError,
        )

        const call =
          mocks.observe.mock
            .calls[0]

        const wrappedError =
          call[4] as (
            error: unknown,
          ) => void

        wrappedError({
          code:
            '42501',
        })

        expect(
          onError,
        ).toHaveBeenCalledWith({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'addAddress',
  () => {
    it(
      'creates an address through the trusted save_address RPC',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          'new-address',
        )

        await expect(
          addAddress(
            'alice',
            INPUT,
            [],
          ),
        ).resolves.toBe(
          'new-address',
        )

        expect(
          mocks.requireIdentity,
        ).toHaveBeenCalledWith(
          'alice',
        )

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'save_address',
          {
            target:
              null,

            payload: {
              fullName:
                'Ada Lovelace',

              addressLine1:
                '12 Analytical Ave',

              addressLine2:
                '',

              city:
                'London',

              state:
                'London',

              postalCode:
                'SW1A 1AA',

              country:
                'UK',

              phone:
                '',

              isDefault:
                false,
            },
          },
        )
      },
    )

    it(
      'trims address values before sending them to the RPC',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          'new-address',
        )

        await addAddress(
          'alice',
          {
            ...INPUT,

            fullName:
              '  Ada Lovelace  ',

            addressLine1:
              '  12 Analytical Ave  ',

            city:
              ' London ',

            state:
              ' London ',

            postalCode:
              ' SW1A 1AA ',

            country:
              ' UK ',

            phone:
              ' 1234567890 ',
          },
          [],
        )

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'save_address',
          {
            target:
              null,

            payload:
              expect.objectContaining({
                fullName:
                  'Ada Lovelace',

                addressLine1:
                  '12 Analytical Ave',

                city:
                  'London',

                state:
                  'London',

                postalCode:
                  'SW1A 1AA',

                country:
                  'UK',

                phone:
                  '1234567890',
              }),
          },
        )
      },
    )

    it(
      'maps permission errors returned by the RPC',
      async () => {
        mocks.rpc.mockRejectedValueOnce({
          code:
            '42501',
        })

        await expect(
          addAddress(
            'alice',
            INPUT,
            [],
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )

    it(
      'rejects when the server does not return an address id',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          null,
        )

        await expect(
          addAddress(
            'alice',
            INPUT,
            [],
          ),
        ).rejects.toMatchObject({
          code:
            'unknown',
        })
      },
    )
  },
)

describe(
  'updateAddress',
  () => {
    it(
      'updates the address through save_address RPC',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          undefined,
        )

        await updateAddress(
          'alice',
          'a1',
          INPUT,
          [],
        )

        expect(
          mocks.requireIdentity,
        ).toHaveBeenCalledWith(
          'alice',
        )

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'save_address',
          {
            target:
              'a1',

            payload: {
              fullName:
                'Ada Lovelace',

              addressLine1:
                '12 Analytical Ave',

              addressLine2:
                '',

              city:
                'London',

              state:
                'London',

              postalCode:
                'SW1A 1AA',

              country:
                'UK',

              phone:
                '',

              isDefault:
                false,
            },
          },
        )
      },
    )

    it(
      'maps update permission failures',
      async () => {
        mocks.rpc.mockRejectedValueOnce({
          code:
            '42501',
        })

        await expect(
          updateAddress(
            'alice',
            'a1',
            INPUT,
            [],
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'setDefaultAddress',
  () => {
    it(
      'uses the trusted set_default_address RPC',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          undefined,
        )

        await setDefaultAddress(
          'alice',
          'a1',
          [
            'other1',
            'other2',
          ],
        )

        expect(
          mocks.requireIdentity,
        ).toHaveBeenCalledWith(
          'alice',
        )

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'set_default_address',
          {
            target:
              'a1',
          },
        )
      },
    )

    it(
      'maps permission failures',
      async () => {
        mocks.rpc.mockRejectedValueOnce({
          code:
            '42501',
        })

        await expect(
          setDefaultAddress(
            'alice',
            'a1',
            [],
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'deleteAddress',
  () => {
    it(
      'deletes through the trusted delete_address RPC',
      async () => {
        mocks.rpc.mockResolvedValueOnce(
          undefined,
        )

        await deleteAddress(
          'alice',
          'a1',
        )

        expect(
          mocks.requireIdentity,
        ).toHaveBeenCalledWith(
          'alice',
        )

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'delete_address',
          {
            target:
              'a1',
          },
        )
      },
    )

    it(
      'maps delete permission failures',
      async () => {
        mocks.rpc.mockRejectedValueOnce({
          code:
            '42501',
        })

        await expect(
          deleteAddress(
            'alice',
            'a1',
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'identity protection',
  () => {
    it(
      'does not add an address when the current user does not match',
      async () => {
        mocks.requireIdentity.mockRejectedValueOnce({
          code:
            '42501',
        })

        await expect(
          addAddress(
            'alice',
            INPUT,
            [],
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled()
      },
    )
  },
)

describe(
  'toAddressError',
  () => {
    it(
      'maps PostgreSQL permission-denied code',
      () => {
        expect(
          toAddressError({
            code:
              '42501',
          }),
        ).toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )

    it(
      'maps the Supabase PGRST permission code',
      () => {
        expect(
          toAddressError({
            code:
              'PGRST301',
          }),
        ).toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )

    it(
      'maps network-related errors',
      () => {
        expect(
          toAddressError(
            new TypeError(
              'Network failed',
            ),
          ),
        ).toEqual({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })
      },
    )

    it(
      'maps unavailable to network for migration compatibility',
      () => {
        expect(
          toAddressError({
            code:
              'unavailable',
          }),
        ).toEqual({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })
      },
    )

    it(
      'falls back to unknown for unrecognized errors',
      () => {
        expect(
          toAddressError(
            new Error(
              'boom',
            ),
          ),
        ).toEqual({
          code:
            'unknown',

          message:
            'Something went wrong. Please try again.',
        })
      },
    )
  },
)
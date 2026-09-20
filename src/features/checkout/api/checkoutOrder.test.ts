import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock(
  '@/lib/supabase/data',
  () => ({
    rpc,
  }),
)

const {
  createCheckoutOrder,
} = await import(
  './checkoutOrder'
)

beforeEach(() => {
  rpc.mockReset()
})

describe(
  'checkout Supabase RPC client',
  () => {
    it(
      'calls the trusted create_checkout_order RPC and returns only the server receipt',
      async () => {
        const request = {
          artworkIds: [
            'a1',
          ],
          addressId:
            'saved',
          idempotencyKey:
            'request-123456789',
        }

        const receipt = {
          orderId:
            'trusted',
          amount:
            12599,
          currency:
            'INR',
          status:
            'PAYMENT_PENDING',
          pricingState:
            'ITEMS_ONLY',
          reservationExpiresAt:
            1000,
        }

        rpc.mockResolvedValueOnce(
          receipt,
        )

        await expect(
          createCheckoutOrder(
            request,
          ),
        ).resolves.toEqual(
          receipt,
        )

        expect(
          rpc,
        ).toHaveBeenCalledTimes(
          1,
        )

        expect(
          rpc,
        ).toHaveBeenCalledWith(
          'create_checkout_order',
          {
            artwork_ids: [
              'a1',
            ],
            address_id:
              'saved',
            idempotency_key:
              'request-123456789',
          },
        )
      },
    )

    it(
      'propagates a typed Supabase failure instead of creating a local success',
      async () => {
        const error = {
          code: 'network',
          message:
            'Network unavailable. Check your connection and try again.',
        }

        rpc.mockRejectedValueOnce(
          error,
        )

        await expect(
          createCheckoutOrder(
            {
              artworkIds: [
                'a1',
              ],
              addressId:
                'saved',
              idempotencyKey:
                'request-123456789',
            },
          ),
        ).rejects.toEqual(
          error,
        )
      },
    )
  },
)
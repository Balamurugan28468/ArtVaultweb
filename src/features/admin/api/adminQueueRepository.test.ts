import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, from, result: supabaseResult } = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  const from = vi.fn(() => builder)
  const rpc = vi.fn()
  return {
    createClient: vi.fn(() => ({ from, rpc })),
    from,
    rpc,
    result: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  result: supabaseResult,
}))

const {
  getPendingSellerApplications,
  getAllSellerProfiles,
  getSubmittedArtworks,
  getAllArtworks,
  getAdminDashboardMetrics,
  getAdminUsers,
  getAdminOrders,
  getAdminPayments,
  getAdminAuditLogs,
} = await import('./adminQueueRepository')

function fakeSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return docs.map((document) => ({ id: document.id, ...document.data }))
}

const now = '2026-09-19T10:00:00.000Z'

beforeEach(() => {
  supabaseResult.mockReset()
  from.mockClear()
})

describe('getPendingSellerApplications', () => {
  it('queries sellers where status == PENDING and maps + sorts oldest-applied-first', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'alice',
          data: {
            status: 'PENDING',
            business_name: 'Alice Art',
            description: 'd',
            contact_email: 'alice@example.com',
            reviewed_at: null,
            created_at: now,
            updated_at: now,
          },
        },
        {
          id: 'bob',
          data: {
            status: 'PENDING',
            business_name: 'Bob Art',
            description: 'd',
            contact_email: 'bob@example.com',
            reviewed_at: null,
            created_at: '2026-09-19T10:00:10.000Z',
            updated_at: '2026-09-19T10:00:10.000Z',
          },
        },
      ]),
    )

    const result = await getPendingSellerApplications()

    expect(from).toHaveBeenCalledWith('seller_profiles')
    expect(result.map((a) => a.uid)).toEqual(['alice', 'bob'])
  })

  it('drops a malformed document rather than crashing', async () => {
    supabaseResult.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getPendingSellerApplications()
    expect(result).toEqual([])
  })

  it('translates an RLS error into a safe SellerError', async () => {
    supabaseResult.mockRejectedValueOnce({ code: '42501' })
    await expect(getPendingSellerApplications()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('getSubmittedArtworks', () => {
  it('queries artworks where status == SUBMITTED and maps + sorts oldest-updated-first', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'a2',
          data: {
            seller_id: 'alice',
            status: 'SUBMITTED',
            title: 'Newer',
            description: 'd',
            price_minor: 1000,
            category: 'painting',
            tags: [],
            images: [],
            physical_quantity: 1,
            reserved_quantity: 0,
            reviewed_at: null,
            rejection_reason: null,
            like_count: 0,
            created_at: now,
            updated_at: '2026-09-19T10:00:10.000Z',
          },
        },
        {
          id: 'a1',
          data: {
            seller_id: 'alice',
            status: 'SUBMITTED',
            title: 'Older',
            description: 'd',
            price_minor: 1000,
            category: 'painting',
            tags: [],
            images: [],
            physical_quantity: 1,
            reserved_quantity: 0,
            reviewed_at: null,
            rejection_reason: null,
            like_count: 0,
            created_at: now,
            updated_at: now,
          },
        },
      ]),
    )

    const result = await getSubmittedArtworks()

    expect(from).toHaveBeenCalledWith('artwork_catalog')
    expect(result.map((a) => a.id)).toEqual(['a2', 'a1'])
  })

  it('drops a malformed document rather than crashing', async () => {
    supabaseResult.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getSubmittedArtworks()
    expect(result).toEqual([])
  })

  it('translates an RLS error into a safe ArtworkError', async () => {
    supabaseResult.mockRejectedValueOnce({ code: '42501' })
    await expect(getSubmittedArtworks()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('getAllSellerProfiles', () => {
  it('queries all seller_profiles and returns mapped results', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'alice',
          data: {
            status: 'APPROVED',
            business_name: 'Alice Art',
            description: 'd',
            contact_email: 'alice@example.com',
            reviewed_at: now,
            created_at: now,
            updated_at: now,
          },
        },
      ]),
    )
    const result = await getAllSellerProfiles()
    expect(from).toHaveBeenCalledWith('seller_profiles')
    expect(result).toHaveLength(1)
    expect(result[0].uid).toBe('alice')
  })

  it('returns empty array when no sellers exist', async () => {
    supabaseResult.mockResolvedValueOnce([])
    const result = await getAllSellerProfiles()
    expect(result).toEqual([])
  })
})

describe('getAllArtworks', () => {
  it('queries all artworks from artwork_catalog', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'art1',
          data: {
            seller_id: 'alice',
            status: 'PUBLISHED',
            title: 'Sunset',
            description: 'd',
            price_minor: 5000,
            category: 'painting',
            tags: [],
            images: [],
            physical_quantity: 1,
            reserved_quantity: 0,
            reviewed_at: null,
            rejection_reason: null,
            like_count: 0,
            created_at: now,
            updated_at: now,
          },
        },
      ]),
    )
    const result = await getAllArtworks()
    expect(from).toHaveBeenCalledWith('artwork_catalog')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('art1')
  })
})

describe('getAdminDashboardMetrics', () => {
  it('calls the get_admin_dashboard_metrics RPC and returns mapped metrics', async () => {
    supabaseResult.mockResolvedValueOnce({
      totalUsers: 100,
      totalSellers: 20,
      pendingSellers: 3,
      approvedSellers: 15,
      suspendedSellers: 2,
      totalArtworks: 50,
      publishedArtworks: 30,
      submittedArtworks: 5,
      suspendedArtworks: 2,
      rejectedArtworks: 13,
      totalOrders: 200,
      paidOrders: 180,
      pendingOrders: 10,
      cancelledOrders: 10,
      totalRevenueMinor: 9000000,
    })
    const metrics = await getAdminDashboardMetrics()
    expect(metrics.totalUsers).toBe(100)
    expect(metrics.totalSellers).toBe(20)
    expect(metrics.paidOrders).toBe(180)
    expect(metrics.totalRevenueMinor).toBe(9000000)
  })

  it('throws if the RPC returns null/non-object', async () => {
    supabaseResult.mockResolvedValueOnce(null)
    await expect(getAdminDashboardMetrics()).rejects.toThrow('Failed to load admin dashboard metrics')
  })
})

describe('getAdminUsers', () => {
  it('calls get_admin_users RPC and maps user records', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'u1',
        display_name: 'Alice',
        email: 'alice@example.com',
        role: 'CUSTOMER',
        account_status: 'ACTIVE',
        seller_status: null,
        created_at: now,
      },
    ])
    const users = await getAdminUsers()
    expect(users).toHaveLength(1)
    expect(users[0].id).toBe('u1')
    expect(users[0].displayName).toBe('Alice')
    expect(users[0].accountStatus).toBe('ACTIVE')
  })

  it('maps SUSPENDED account_status correctly', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'u2',
        display_name: null,
        email: null,
        role: 'CUSTOMER',
        account_status: 'SUSPENDED',
        seller_status: null,
        created_at: now,
      },
    ])
    const users = await getAdminUsers()
    expect(users[0].accountStatus).toBe('SUSPENDED')
  })
})

describe('getAdminOrders', () => {
  it('calls get_admin_orders RPC and maps order records', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'ord1',
        buyer_id: 'buyer1',
        buyer_name: 'Bob Buyer',
        buyer_email: 'bob@example.com',
        status: 'PAID',
        payment_state: 'CAPTURED',
        currency: 'INR',
        total_minor: 550000,
        item_count: 1,
        created_at: now,
      },
    ])
    const orders = await getAdminOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].id).toBe('ord1')
    expect(orders[0].totalMinor).toBe(550000)
    expect(orders[0].currency).toBe('INR')
  })
})

describe('getAdminPayments', () => {
  it('calls get_admin_payments RPC and maps payment records', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'pay1',
        order_id: 'ord1',
        provider: 'razorpay',
        mode: 'TEST',
        status: 'CAPTURED',
        gateway_phase: 'POST_PAYMENT',
        amount_minor: 550000,
        currency: 'INR',
        provider_order_id: 'order_test_123',
        provider_payment_id: 'pay_test_456',
        created_at: now,
      },
    ])
    const payments = await getAdminPayments()
    expect(payments).toHaveLength(1)
    expect(payments[0].id).toBe('pay1')
    expect(payments[0].mode).toBe('TEST')
    expect(payments[0].amountMinor).toBe(550000)
    expect(payments[0].providerOrderId).toBe('order_test_123')
  })
})

describe('getAdminAuditLogs', () => {
  it('calls get_admin_logs RPC and maps audit log records', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'log1',
        actor_id: 'admin1',
        actor_name: 'Super Admin',
        action: 'APPROVE_SELLER',
        target_type: 'seller',
        target_id: 'seller1',
        reason: null,
        previous_state: 'PENDING',
        new_state: 'APPROVED',
        occurred_at: now,
      },
    ])
    const logs = await getAdminAuditLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].id).toBe('log1')
    expect(logs[0].actorName).toBe('Super Admin')
    expect(logs[0].previousState).toBe('PENDING')
    expect(logs[0].newState).toBe('APPROVED')
  })

  it('handles null actor_name and reason gracefully', async () => {
    supabaseResult.mockResolvedValueOnce([
      {
        id: 'log2',
        actor_id: 'admin1',
        actor_name: null,
        action: 'SUSPEND_USER',
        target_type: 'user',
        target_id: 'user1',
        reason: null,
        previous_state: null,
        new_state: null,
        occurred_at: now,
      },
    ])
    const logs = await getAdminAuditLogs()
    expect(logs[0].actorName).toBeNull()
    expect(logs[0].reason).toBeNull()
    expect(logs[0].previousState).toBeNull()
  })
})

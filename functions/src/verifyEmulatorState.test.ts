import { beforeEach, describe, expect, it, vi } from 'vitest'

const listUsers = vi.fn()
const usersGet = vi.fn()
const sellersGet = vi.fn()
const artworksGet = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ listUsers }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'users') return { get: usersGet }
      if (name === 'sellers') return { get: sellersGet }
      if (name === 'artworks') return { get: artworksGet }
      throw new Error(`unexpected collection: ${name}`)
    },
  }),
}))
vi.mock('node:fs', () => ({ existsSync: () => false, readFileSync: vi.fn() }))

const { readEmulatorState } = await import('./verifyEmulatorState')

function docs(entries: Array<{ id: string; data: Record<string, unknown> }>) {
  return { size: entries.length, docs: entries.map((e) => ({ id: e.id, data: () => e.data })) }
}

beforeEach(() => {
  listUsers.mockReset()
  usersGet.mockReset()
  sellersGet.mockReset()
  artworksGet.mockReset()
})

describe('readEmulatorState', () => {
  it('reports aggregate counts and flags an approved seller missing its Auth claim', async () => {
    listUsers.mockResolvedValueOnce({ users: [{ uid: 'alice', customClaims: {} }] })
    usersGet.mockResolvedValueOnce(docs([{ id: 'alice', data: { role: 'CUSTOMER' } }]))
    sellersGet.mockResolvedValueOnce(docs([{ id: 'alice', data: { status: 'APPROVED' } }]))
    artworksGet.mockResolvedValueOnce(docs([]))

    const summary = await readEmulatorState()

    expect(summary.authUsers).toBe(1)
    expect(summary.approvedSellers).toBe(1)
    expect(summary.approvedWithSellerClaim).toBe(0)
    expect(summary.approvedMissingSellerClaim).toEqual(['alice'])
    expect(summary.owner).toBeNull()
  })

  it('never mutates data — reads every collection exactly once and calls no write method', async () => {
    listUsers.mockResolvedValueOnce({ users: [] })
    usersGet.mockResolvedValueOnce(docs([]))
    sellersGet.mockResolvedValueOnce(docs([]))
    artworksGet.mockResolvedValueOnce(docs([]))

    await readEmulatorState()

    expect(usersGet).toHaveBeenCalledTimes(1)
    expect(sellersGet).toHaveBeenCalledTimes(1)
    expect(artworksGet).toHaveBeenCalledTimes(1)
  })

  it('reports the owner section when an owner UID is given, including artwork count', async () => {
    listUsers.mockResolvedValueOnce({
      users: [{ uid: 'owner-1', email: 'owner@example.com', customClaims: { role: 'SELLER' } }],
    })
    usersGet.mockResolvedValueOnce(docs([{ id: 'owner-1', data: { role: 'SELLER' } }]))
    sellersGet.mockResolvedValueOnce(docs([{ id: 'owner-1', data: { status: 'APPROVED' } }]))
    artworksGet.mockResolvedValueOnce(
      docs([
        { id: 'art-1', data: { sellerId: 'owner-1' } },
        { id: 'art-2', data: { sellerId: 'someone-else' } },
      ]),
    )

    const summary = await readEmulatorState('owner-1')

    expect(summary.owner).toEqual({
      uid: 'owner-1',
      authFound: true,
      email: 'owner@example.com',
      authRole: 'SELLER',
      usersRole: 'SELLER',
      sellerStatus: 'APPROVED',
      artworkCount: 1,
    })
  })

  it('reports the owner as not found rather than throwing when the UID does not exist', async () => {
    listUsers.mockResolvedValueOnce({ users: [] })
    usersGet.mockResolvedValueOnce(docs([]))
    sellersGet.mockResolvedValueOnce(docs([]))
    artworksGet.mockResolvedValueOnce(docs([]))

    const summary = await readEmulatorState('missing-uid')

    expect(summary.owner).toEqual({
      uid: 'missing-uid',
      authFound: false,
      email: null,
      authRole: null,
      usersRole: null,
      sellerStatus: null,
      artworkCount: 0,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promoteSellerByUid } from './promoteSeller'

const setCustomUserClaims = vi.fn()
const sellersGet = vi.fn()
const sellersUpdate = vi.fn()
const usersUpdate = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'sellers') return { doc: () => ({ get: sellersGet, update: sellersUpdate }) }
      if (name === 'users') return { doc: () => ({ update: usersUpdate }) }
      throw new Error(`unexpected collection: ${name}`)
    },
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  setCustomUserClaims.mockClear()
  sellersGet.mockReset()
  sellersUpdate.mockClear()
  usersUpdate.mockClear()
})

describe('promoteSellerByUid', () => {
  it('grants the SELLER claim, mirrors role on users/{uid}, and approves the seller application', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })

    await promoteSellerByUid('alice')

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: 'SELLER' }))
    expect(sellersUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }))
  })

  it('refuses to promote a uid with no seller application', async () => {
    sellersGet.mockResolvedValue({ exists: false })

    await expect(promoteSellerByUid('bob')).rejects.toThrow(/no seller application/i)
    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(sellersUpdate).not.toHaveBeenCalled()
  })

  it('refuses to re-promote an already-approved application (idempotency guard, not a silent no-op)', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'APPROVED' }) })

    await expect(promoteSellerByUid('carol')).rejects.toThrow(/already approved/i)
    expect(setCustomUserClaims).not.toHaveBeenCalled()
  })
})

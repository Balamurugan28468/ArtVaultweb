import { beforeEach, describe, expect, it, vi } from 'vitest'

const setCustomUserClaims = vi.fn()
const getUser = vi.fn()
const sellersGet = vi.fn()
const sellersWhereGet = vi.fn()
const usersGet = vi.fn()
const usersUpdate = vi.fn()
const usersSet = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims, getUser }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'sellers') {
        return {
          doc: () => ({ get: sellersGet }),
          where: () => ({ get: sellersWhereGet }),
        }
      }
      if (name === 'users') return { doc: () => ({ get: usersGet, update: usersUpdate, set: usersSet }) }
      throw new Error(`unexpected collection: ${name}`)
    },
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

const { reconcileRoles } = await import('./reconcileRoles')

beforeEach(() => {
  setCustomUserClaims.mockReset()
  getUser.mockReset()
  sellersGet.mockReset()
  sellersWhereGet.mockReset()
  usersGet.mockReset()
  usersUpdate.mockReset()
  usersSet.mockReset()
})

describe('reconcileRoles', () => {
  it('restores the SELLER claim from a trusted APPROVED seller record when the claim went missing', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValueOnce({ customClaims: { role: 'CUSTOMER' } })
    usersGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'CUSTOMER' }) })

    const [result] = await reconcileRoles('alice')

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: 'SELLER' }))
    expect(result).toEqual({ uid: 'alice', action: 'restored-both' })
  })

  it('restores only the claim when the users/{uid} mirror is already correct', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValueOnce({ customClaims: {} })
    usersGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'SELLER' }) })

    const [result] = await reconcileRoles('alice')

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(result.action).toBe('restored-seller-claim')
  })

  it('is idempotent: a fully consistent SELLER is left untouched', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValueOnce({ customClaims: { role: 'SELLER' } })
    usersGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'SELLER' }) })

    const [result] = await reconcileRoles('alice')

    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(result).toEqual({ uid: 'alice', action: 'already-consistent' })
  })

  it('refuses to act on a PENDING (not yet approved) seller application', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'PENDING' }) })

    const [result] = await reconcileRoles('alice')

    expect(getUser).not.toHaveBeenCalled()
    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(result).toEqual({ uid: 'alice', action: 'already-consistent' })
  })

  it('refuses to act when no seller application exists at all', async () => {
    sellersGet.mockResolvedValueOnce({ exists: false })

    const [result] = await reconcileRoles('alice')

    expect(getUser).not.toHaveBeenCalled()
    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(result).toEqual({ uid: 'alice', action: 'already-consistent' })
  })

  it('creates a SELLER profile when an approved seller has no profile document', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValueOnce({ customClaims: {} })
    usersGet.mockResolvedValueOnce({ exists: false, data: () => undefined })

    await reconcileRoles('alice')

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(usersSet).toHaveBeenCalledWith(expect.objectContaining({ uid: 'alice', role: 'SELLER' }))
  })

  it('can never grant a role other than the literal string SELLER — every write is exactly {role: "SELLER"}', async () => {
    sellersGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValueOnce({ customClaims: {} })
    usersGet.mockResolvedValueOnce({ exists: true, data: () => ({ role: 'CUSTOMER' }) })

    await reconcileRoles('alice')

    // Not a partial/objectContaining match — the exact, complete argument
    // must be {role: 'SELLER'}, proving there is no path for any other
    // value (ADMIN, SUPER_ADMIN, or anything else) to reach this call.
    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ role: 'SELLER' }))
  })

  it('scans and reconciles every APPROVED seller when called with no uid', async () => {
    sellersWhereGet.mockResolvedValueOnce({ docs: [{ id: 'alice' }, { id: 'bob' }] })
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'APPROVED' }) })
    getUser.mockResolvedValue({ customClaims: {} })
    usersGet.mockResolvedValue({ exists: true, data: () => ({ role: 'CUSTOMER' }) })

    const results = await reconcileRoles()

    expect(results).toHaveLength(2)
    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(setCustomUserClaims).toHaveBeenCalledWith('bob', { role: 'SELLER' })
  })
})

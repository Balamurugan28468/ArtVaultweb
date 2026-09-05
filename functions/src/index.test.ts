import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleUserCreate } from './index'

const setCustomUserClaims = vi.fn()
const get = vi.fn()
const set = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ get, set }) }),
    runTransaction: async (updateFunction: (tx: { get: typeof get; set: typeof set }) => Promise<void>) =>
      updateFunction({ get, set }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  setCustomUserClaims.mockClear()
  get.mockReset().mockResolvedValue({ exists: false })
  set.mockClear()
})

describe('handleUserCreate', () => {
  it('sets the default CUSTOMER role claim and creates the profile document', async () => {
    await handleUserCreate({ uid: 'alice', email: 'alice@example.com', displayName: 'Alice' })

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'CUSTOMER' })
    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'CUSTOMER',
      }),
    )
  })

  it('normalizes a missing email/displayName to null rather than undefined', async () => {
    await handleUserCreate({ uid: 'bob' })

    expect(set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ email: null, displayName: null }))
  })

  it('is idempotent: skips the write when a client already self-provisioned the profile', async () => {
    get.mockResolvedValueOnce({ exists: true })

    await handleUserCreate({ uid: 'carol', email: 'carol@example.com', displayName: 'Carol' })

    expect(setCustomUserClaims).toHaveBeenCalledWith('carol', { role: 'CUSTOMER' })
    expect(set).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const setCustomUserClaims = vi.fn()
const getUser = vi.fn()
const usersGet = vi.fn()
const usersSet = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims, getUser }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'users') return { doc: () => ({ get: usersGet, set: usersSet }) }
      throw new Error(`unexpected collection: ${name}`)
    },
    // handleUserCreate (imported from ./index, called internally by
    // repairMissingProfile) runs its own idempotent check-then-set inside a
    // transaction — reuses the same usersGet/usersSet mocks, since it's
    // operating on the same users/{uid} document repairMissingProfile
    // already checked itself.
    runTransaction: async (updateFunction: (tx: { get: typeof usersGet; set: typeof usersSet }) => Promise<void>) =>
      updateFunction({ get: usersGet, set: usersSet }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

const { repairMissingProfile } = await import('./repairMissingProfile')

beforeEach(() => {
  setCustomUserClaims.mockClear()
  getUser.mockReset()
  usersGet.mockReset()
  usersSet.mockClear()
})

describe('repairMissingProfile', () => {
  it('creates the missing profile document from the real Auth user record, defaulting to CUSTOMER', async () => {
    usersGet.mockResolvedValue({ exists: false })
    getUser.mockResolvedValueOnce({ uid: 'alice', email: 'alice@example.com', displayName: 'Alice', photoURL: null })

    const result = await repairMissingProfile('alice')

    expect(result).toBe('repaired')
    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'CUSTOMER' })
    expect(usersSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ uid: 'alice', email: 'alice@example.com', displayName: 'Alice', role: 'CUSTOMER' }),
    )
  })

  it('refuses to touch an account whose profile already exists — idempotent, never overwrites or duplicates', async () => {
    usersGet.mockResolvedValue({ exists: true })

    const result = await repairMissingProfile('bob')

    expect(result).toBe('already-exists')
    expect(getUser).not.toHaveBeenCalled()
    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(usersSet).not.toHaveBeenCalled()
  })

  it('normalizes a missing displayName/photoURL to null rather than undefined', async () => {
    usersGet.mockResolvedValue({ exists: false })
    getUser.mockResolvedValueOnce({ uid: 'carol', email: 'carol@example.com' })

    await repairMissingProfile('carol')

    expect(usersSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: null, photoURL: null }),
    )
  })

  it('never grants a role other than the default CUSTOMER — no privilege escalation path', async () => {
    usersGet.mockResolvedValue({ exists: false })
    getUser.mockResolvedValueOnce({ uid: 'dave', email: 'dave@example.com' })

    await repairMissingProfile('dave')

    expect(setCustomUserClaims).toHaveBeenCalledWith('dave', { role: 'CUSTOMER' })
    expect(usersSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'CUSTOMER' }))
  })
})

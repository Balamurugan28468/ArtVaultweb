import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const doc = vi.fn((...args: unknown[]) => ({ args }))
const getDoc = vi.fn()
const runTransaction = vi.fn()
const serverTimestamp = vi.fn(() => 'SERVER_TIMESTAMP')

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => doc(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  runTransaction: (...args: unknown[]) => runTransaction(...args),
  serverTimestamp: () => serverTimestamp(),
}))
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { ensureUserProfile } = await import('./ensureUserProfile')

const fakeUser = { uid: 'alice', email: 'alice@example.com', displayName: null, photoURL: null } as User

function fakeTransaction(exists: boolean) {
  return { get: vi.fn().mockResolvedValue({ exists: () => exists }), set: vi.fn() }
}

beforeEach(() => {
  doc.mockClear()
  getDoc.mockReset()
  runTransaction.mockReset()
})

describe('ensureUserProfile', () => {
  it('does nothing when the profile document already exists', async () => {
    const tx = fakeTransaction(true)
    runTransaction.mockImplementationOnce(async (_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      await updateFn(tx)
    })

    await ensureUserProfile(fakeUser, { role: 'CUSTOMER' })

    expect(tx.set).not.toHaveBeenCalled()
  })

  it('never downgrades an existing SELLER profile to CUSTOMER, even if called with role: "CUSTOMER"', async () => {
    // This function has no code path that reads an existing document's
    // current role at all — the transaction's only question is "does a
    // document exist" (see fakeTransaction(true) above); if it does, this
    // call is a complete no-op regardless of what `role` was passed in.
    // That's what makes it structurally impossible for an ordinary
    // ensureUserProfile call (e.g. AuthProvider momentarily reading a stale
    // or default role during session restore) to ever overwrite a real
    // SELLER's profile back to CUSTOMER.
    const tx = fakeTransaction(true)
    runTransaction.mockImplementationOnce(async (_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      await updateFn(tx)
    })

    await ensureUserProfile(fakeUser, { role: 'CUSTOMER' })

    expect(tx.set).not.toHaveBeenCalled()
  })

  it('creates the canonical profile document when missing, with the caller-provided display name', async () => {
    const tx = fakeTransaction(false)
    runTransaction.mockImplementationOnce(async (_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      await updateFn(tx)
    })

    await ensureUserProfile(fakeUser, { role: 'CUSTOMER', displayName: 'Alice' })

    expect(tx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'CUSTOMER',
        photoURL: null,
        phoneNumber: null,
        bio: null,
        profileCompleted: false,
      }),
    )
  })

  it('falls back to the Auth user displayName when none is explicitly provided', async () => {
    const tx = fakeTransaction(false)
    runTransaction.mockImplementationOnce(async (_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      await updateFn(tx)
    })

    await ensureUserProfile({ ...fakeUser, displayName: 'From Auth' } as User, { role: 'CUSTOMER' })

    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ displayName: 'From Auth' }))
  })

  it('preserves a trusted SELLER role when recovering a missing profile — never downgrades to CUSTOMER', async () => {
    const tx = fakeTransaction(false)
    runTransaction.mockImplementationOnce(async (_db: unknown, updateFn: (tx: unknown) => Promise<void>) => {
      await updateFn(tx)
    })

    await ensureUserProfile(fakeUser, { role: 'SELLER' })

    expect(tx.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'SELLER' }))
  })

  it('treats a rejected write as success if the document turns out to already exist (benign race with onUserCreate)', async () => {
    runTransaction.mockRejectedValueOnce(new Error('permission-denied'))
    getDoc.mockResolvedValueOnce({ exists: () => true })

    await expect(ensureUserProfile(fakeUser, { role: 'CUSTOMER' })).resolves.toBeUndefined()
  })

  it('propagates a genuine failure — does not swallow it — when the document still does not exist afterward', async () => {
    runTransaction.mockRejectedValueOnce(new Error('permission-denied'))
    getDoc.mockResolvedValueOnce({ exists: () => false })

    await expect(ensureUserProfile(fakeUser, { role: 'CUSTOMER' })).rejects.toThrow('permission-denied')
  })
})

import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createUserWithEmailAndPassword = vi.fn()
const updateProfile = vi.fn()
const setPersistence = vi.fn()
const updateDoc = vi.fn()
const doc = vi.fn((...args: unknown[]) => ({ args }))
const serverTimestamp = vi.fn(() => 'server-timestamp')
const ensureUserProfile = vi.fn()
const toAuthErrorMessage = vi.fn((error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.'))

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserWithEmailAndPassword(...args),
  setPersistence: (...args: unknown[]) => setPersistence(...args),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: (...args: unknown[]) => updateProfile(...args),
}))
vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => doc(...args),
  serverTimestamp: () => serverTimestamp(),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}))
vi.mock('@/lib/firebase/config', () => ({ auth: {}, db: {} }))
vi.mock('./authErrors', () => ({ toAuthErrorMessage: (error: unknown) => toAuthErrorMessage(error) }))
vi.mock('./ensureUserProfile', () => ({ ensureUserProfile: (...args: unknown[]) => ensureUserProfile(...args) }))

const { signUpWithEmail } = await import('./authClient')

const fakeUser = { uid: 'alice' } as User

beforeEach(() => {
  createUserWithEmailAndPassword.mockReset().mockResolvedValue({ user: fakeUser })
  updateProfile.mockReset().mockResolvedValue(undefined)
  setPersistence.mockReset().mockResolvedValue(undefined)
  updateDoc.mockReset()
  doc.mockClear()
  ensureUserProfile.mockReset().mockResolvedValue(undefined)
  toAuthErrorMessage.mockClear()
})

// Regression coverage for a real, now permanently-fixed architectural gap:
// users/{uid} used to depend entirely on the asynchronous onUserCreate
// Cloud Function trigger, which repeatedly failed to run on this project's
// local Functions emulator under load. signUpWithEmail now calls
// ensureUserProfile — a client-triggered, rules-enforced, idempotent
// provisioning guarantee (see ensureUserProfile.ts/firestore.rules) — so
// the canonical profile is guaranteed to exist synchronously with sign-up
// itself, never dependent on an out-of-band trigger completing.
describe('signUpWithEmail', () => {
  it('guarantees the canonical profile exists (as CUSTOMER) before writing the display name', async () => {
    const callOrder: string[] = []
    ensureUserProfile.mockImplementationOnce(async () => {
      callOrder.push('ensured-profile')
    })
    updateDoc.mockImplementationOnce(async () => {
      callOrder.push('updated-display-name')
    })

    await signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })

    expect(ensureUserProfile).toHaveBeenCalledWith(fakeUser, { role: 'CUSTOMER', displayName: 'Alice' })
    expect(callOrder).toEqual(['ensured-profile', 'updated-display-name'])
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Alice',
      updatedAt: 'server-timestamp',
    })
  })

  it('propagates a genuine profile-provisioning failure instead of silently swallowing it', async () => {
    ensureUserProfile.mockRejectedValueOnce(new Error('permission-denied'))

    await expect(
      signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' }),
    ).rejects.toThrow('permission-denied')

    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('writes the display name exactly once — never creates a duplicate profile document', async () => {
    await signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })

    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(doc).toHaveBeenCalledWith({}, 'users', 'alice')
  })

  it('never requests a role other than CUSTOMER for a brand-new account', async () => {
    await signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })

    expect(ensureUserProfile).toHaveBeenCalledWith(fakeUser, expect.objectContaining({ role: 'CUSTOMER' }))
  })
})

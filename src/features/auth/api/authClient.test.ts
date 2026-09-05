import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createUserWithEmailAndPassword = vi.fn()
const updateProfile = vi.fn()
const setPersistence = vi.fn()
const updateDoc = vi.fn()
const doc = vi.fn((...args: unknown[]) => ({ args }))
const serverTimestamp = vi.fn(() => 'server-timestamp')
const waitForRoleClaim = vi.fn()
const waitForUserProfileDocument = vi.fn()
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
vi.mock('./roleClaim', () => ({ waitForRoleClaim: (...args: unknown[]) => waitForRoleClaim(...args) }))
vi.mock('./profileReady', () => ({ waitForUserProfileDocument: (...args: unknown[]) => waitForUserProfileDocument(...args) }))

const { signUpWithEmail } = await import('./authClient')

const fakeUser = { uid: 'alice' } as User

beforeEach(() => {
  createUserWithEmailAndPassword.mockReset().mockResolvedValue({ user: fakeUser })
  updateProfile.mockReset().mockResolvedValue(undefined)
  setPersistence.mockReset().mockResolvedValue(undefined)
  updateDoc.mockReset()
  doc.mockClear()
  waitForRoleClaim.mockReset().mockResolvedValue('CUSTOMER')
  waitForUserProfileDocument.mockReset().mockResolvedValue(undefined)
  toAuthErrorMessage.mockClear()
})

// Regression coverage for a real race: the onUserCreate Cloud Function
// trigger creates users/{uid} asynchronously, so a client write to that
// document immediately after account creation can hit "update a document
// that doesn't exist yet" and be denied by the rule itself. These tests
// prove signUpWithEmail now waits on the real precondition before writing,
// and that a genuine provisioning failure surfaces rather than being
// swallowed.
describe('signUpWithEmail', () => {
  it('waits for the profile document to exist before writing the display name', async () => {
    const callOrder: string[] = []
    waitForUserProfileDocument.mockImplementationOnce(async () => {
      callOrder.push('waited-for-profile-document')
    })
    updateDoc.mockImplementationOnce(async () => {
      callOrder.push('updated-display-name')
    })

    await signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })

    expect(waitForUserProfileDocument).toHaveBeenCalledWith('alice')
    expect(callOrder).toEqual(['waited-for-profile-document', 'updated-display-name'])
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Alice',
      updatedAt: 'server-timestamp',
    })
  })

  it('propagates a genuine profile-provisioning failure instead of silently swallowing it', async () => {
    waitForUserProfileDocument.mockRejectedValueOnce(
      new Error('Timed out waiting for the account profile to be created.'),
    )

    await expect(
      signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' }),
    ).rejects.toThrow('Timed out waiting for the account profile to be created.')

    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('writes the display name exactly once — never creates a duplicate profile document', async () => {
    await signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })

    expect(updateDoc).toHaveBeenCalledTimes(1)
    expect(doc).toHaveBeenCalledWith({}, 'users', 'alice')
  })
})

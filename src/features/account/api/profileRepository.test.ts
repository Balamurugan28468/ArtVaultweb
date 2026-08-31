import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'

const { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } = vi.hoisted(() => ({
  doc: vi.fn(() => ({ path: 'users/alice' })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, doc, getDoc, onSnapshot, updateDoc, serverTimestamp }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getUserProfile, subscribeUserProfile, toAccountError, updateUserProfile } = await import('./profileRepository')

describe('getUserProfile', () => {
  it('maps a full document to UserProfile', async () => {
    const now = Timestamp.now()
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: 'https://example.com/a.png',
        role: 'CUSTOMER',
        phoneNumber: '+1 555 0100',
        bio: 'Hi',
        profileCompleted: true,
        createdAt: now,
        updatedAt: now,
      }),
    })

    await expect(getUserProfile('alice')).resolves.toEqual({
      uid: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      photoURL: 'https://example.com/a.png',
      role: 'CUSTOMER',
      phoneNumber: '+1 555 0100',
      bio: 'Hi',
      profileCompleted: true,
      createdAt: now,
      updatedAt: now,
    })
  })

  it('returns null when the document does not exist', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    await expect(getUserProfile('alice')).resolves.toBeNull()
  })

  it('defensively defaults missing optional fields on a pre-Module-03 document', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ email: 'bob@example.com', displayName: 'Bob', role: 'CUSTOMER' }),
    })

    const profile = await getUserProfile('bob')
    expect(profile).toMatchObject({ photoURL: null, phoneNumber: null, bio: null, profileCompleted: false })
  })

  it('treats a document with an unrecognized role as unreadable rather than crashing', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ role: 'NOT_A_REAL_ROLE' }) })
    await expect(getUserProfile('mallory')).resolves.toBeNull()
  })
})

describe('updateUserProfile', () => {
  it('writes only the allowed fields plus a deterministic profileCompleted and a server timestamp', async () => {
    updateDoc.mockResolvedValueOnce(undefined)

    await updateUserProfile('alice', { displayName: 'Alice Updated', phoneNumber: '+1 555 0100', bio: 'Hi' })

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Alice Updated',
      phoneNumber: '+1 555 0100',
      bio: 'Hi',
      profileCompleted: true,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('computes profileCompleted as false when bio or phone is missing', async () => {
    updateDoc.mockResolvedValueOnce(undefined)
    await updateUserProfile('alice', { displayName: 'Alice', phoneNumber: null, bio: null })
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ profileCompleted: false }))
  })

  it('throws a typed AccountError when the write is denied', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(
      updateUserProfile('alice', { displayName: 'Alice', phoneNumber: null, bio: null }),
    ).rejects.toEqual({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('toAccountError', () => {
  it('maps unavailable to a network error', () => {
    expect(toAccountError({ code: 'unavailable' })).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toAccountError(new Error('boom'))).toEqual({
      code: 'unknown',
      message: 'Something went wrong. Please try again.',
    })
  })
})

describe('subscribeUserProfile', () => {
  it('subscribes exactly once and returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)

    const result = subscribeUserProfile('alice', vi.fn(), vi.fn())

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBe(unsubscribe)
  })
})

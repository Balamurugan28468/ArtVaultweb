import { FirebaseError } from 'firebase/app'
import { describe, expect, it, vi } from 'vitest'

const { httpsCallable } = vi.hoisted(() => ({ httpsCallable: vi.fn() }))
vi.mock('firebase/functions', () => ({ httpsCallable, getFunctions: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ functions: {} }))

const { approveSellerApplication, isAdminActionError, moderateArtwork, rejectSellerApplication, suspendArtwork } = await import('./adminApi')

describe('adminApi — approveSellerApplication', () => {
  it('calls the approveSellerApplication callable with exactly { uid }', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'APPROVED' } })
    httpsCallable.mockReturnValue(callable)

    await approveSellerApplication('alice')

    expect(httpsCallable).toHaveBeenCalledWith({}, 'approveSellerApplication')
    expect(callable).toHaveBeenCalledWith({ uid: 'alice' })
  })

  it('passes through a real callable error message verbatim — Phase 2 already vetted it', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/failed-precondition', 'Seller application for uid=alice is already approved.'))
    httpsCallable.mockReturnValue(callable)

    await expect(approveSellerApplication('alice')).rejects.toMatchObject({
      message: 'Seller application for uid=alice is already approved.',
    })
  })

  it('replaces a genuinely unexpected (non-callable) error with a generic, safe message', async () => {
    const callable = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    httpsCallable.mockReturnValue(callable)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(approveSellerApplication('alice')).rejects.toMatchObject({
      message: 'Something went wrong. Please try again.',
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})

describe('adminApi — rejectSellerApplication', () => {
  it('calls the rejectSellerApplication callable with exactly { uid, rejectionReason }', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'REJECTED' } })
    httpsCallable.mockReturnValue(callable)

    await rejectSellerApplication('alice', 'Not a fit.')

    expect(callable).toHaveBeenCalledWith({ uid: 'alice', rejectionReason: 'Not a fit.' })
  })

  it('rejects with a safe error on failure', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/permission-denied', 'This action requires an administrator account.'))
    httpsCallable.mockReturnValue(callable)

    await expect(rejectSellerApplication('alice', 'x')).rejects.toMatchObject({
      message: 'This action requires an administrator account.',
    })
  })
})

describe('adminApi — moderateArtwork', () => {
  it('calls the moderateArtwork callable with exactly { artworkId, decision } when publishing (no rejectionReason)', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'PUBLISHED' } })
    httpsCallable.mockReturnValue(callable)

    await moderateArtwork('a1', 'PUBLISHED')

    expect(callable).toHaveBeenCalledWith({ artworkId: 'a1', decision: 'PUBLISHED', rejectionReason: undefined })
  })

  it('calls the moderateArtwork callable with the rejectionReason when rejecting', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'REJECTED' } })
    httpsCallable.mockReturnValue(callable)

    await moderateArtwork('a1', 'REJECTED', 'blurry photos')

    expect(callable).toHaveBeenCalledWith({ artworkId: 'a1', decision: 'REJECTED', rejectionReason: 'blurry photos' })
  })

  it('rejects with a safe error on failure', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/not-found', 'No artwork found for artworkId=ghost.'))
    httpsCallable.mockReturnValue(callable)

    await expect(moderateArtwork('ghost', 'PUBLISHED')).rejects.toMatchObject({
      message: 'No artwork found for artworkId=ghost.',
    })
  })
})

describe('adminApi — suspendArtwork (admin moderation override, UI-03 final correction)', () => {
  it('calls the suspendArtwork callable with exactly { artworkId, reason }', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'SUSPENDED' } })
    httpsCallable.mockReturnValue(callable)

    await suspendArtwork('a1', 'Reported for a policy violation.')

    expect(httpsCallable).toHaveBeenCalledWith({}, 'suspendArtwork')
    expect(callable).toHaveBeenCalledWith({ artworkId: 'a1', reason: 'Reported for a policy violation.' })
  })

  it('rejects with a safe error on failure', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/permission-denied', 'This action requires an administrator account.'))
    httpsCallable.mockReturnValue(callable)

    await expect(suspendArtwork('a1', 'x')).rejects.toMatchObject({
      message: 'This action requires an administrator account.',
    })
  })
})

// Regression test for the real "internal [0]" incident: the Functions
// emulator was serving a stale build with no `suspendArtwork` route, so
// calling it 404'd with no CORS header, which the browser's fetch treated
// as a network failure — the @firebase/functions SDK fabricates exactly
// this FirebaseError client-side (never something our own server code
// produced) whenever that happens. toAdminActionError must never show its
// literal message to a real user.
describe('adminApi — toAdminActionError never leaks the SDK-fabricated "internal [0]" message', () => {
  it('replaces a functions/internal error carrying the SDK\'s own fabricated message with a safe, useful one', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/internal', 'internal [0]'))
    httpsCallable.mockReturnValue(callable)

    await expect(suspendArtwork('a1', 'x')).rejects.toMatchObject({
      message: 'This action could not be completed. Please try again.',
    })
  })

  it('still shows a safe message for a real, vetted functions/internal error from our own server code', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/internal', 'This action could not be completed. Please try again.'))
    httpsCallable.mockReturnValue(callable)

    await expect(suspendArtwork('a1', 'x')).rejects.toMatchObject({
      message: 'This action could not be completed. Please try again.',
    })
  })

  it('still passes through every other functions/* code verbatim (only ever set by our own vetted HttpsError throws)', async () => {
    const callable = vi.fn().mockRejectedValue(new FirebaseError('functions/failed-precondition', 'Artwork a1 is already suspended.'))
    httpsCallable.mockReturnValue(callable)

    await expect(suspendArtwork('a1', 'x')).rejects.toMatchObject({
      message: 'Artwork a1 is already suspended.',
    })
  })
})

describe('isAdminActionError', () => {
  it('recognizes a real AdminActionError shape', () => {
    expect(isAdminActionError({ message: 'x' })).toBe(true)
  })

  it('rejects anything without a string message', () => {
    expect(isAdminActionError(null)).toBe(false)
    expect(isAdminActionError(undefined)).toBe(false)
    expect(isAdminActionError('x')).toBe(false)
    expect(isAdminActionError({ message: 42 })).toBe(false)
  })
})

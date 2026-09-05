import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const doc = vi.fn((..._args: unknown[]) => ({ path: 'users/mock' }))
const onSnapshot = vi.fn()

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => doc(...args),
  onSnapshot: (...args: unknown[]) => onSnapshot(...args),
}))
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { waitForUserProfileDocument } = await import('./profileReady')

beforeEach(() => {
  doc.mockClear()
  onSnapshot.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForUserProfileDocument', () => {
  it('resolves once the profile document snapshot reports it exists', async () => {
    const unsubscribe = vi.fn()
    let onNext: (snapshot: { exists: () => boolean }) => void = () => {}
    onSnapshot.mockImplementationOnce((_ref: unknown, next: typeof onNext) => {
      onNext = next
      return unsubscribe
    })

    const promise = waitForUserProfileDocument('alice')
    // Simulates the onUserCreate trigger not having written the document
    // yet (the real-world race this regression test exists for), followed
    // by the document landing — must not resolve on the first snapshot.
    onNext({ exists: () => false })
    onNext({ exists: () => true })

    await expect(promise).resolves.toBeUndefined()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('rejects — does not silently swallow — when the listener itself errors', async () => {
    const unsubscribe = vi.fn()
    let onError: (error: unknown) => void = () => {}
    onSnapshot.mockImplementationOnce((_ref: unknown, _onNext: unknown, errorCb: typeof onError) => {
      onError = errorCb
      return unsubscribe
    })

    const promise = waitForUserProfileDocument('alice')
    onError(new Error('permission-denied'))

    await expect(promise).rejects.toThrow('permission-denied')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('rejects instead of hanging or resolving when the document never appears in time', async () => {
    vi.useFakeTimers()
    const unsubscribe = vi.fn()
    onSnapshot.mockImplementationOnce(() => unsubscribe)

    const promise = waitForUserProfileDocument('alice', { timeoutMs: 1000 })
    const assertion = expect(promise).rejects.toThrow('Timed out waiting for the account profile to be created.')

    vi.advanceTimersByTime(1000)

    await assertion
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

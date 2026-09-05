import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserProfile } from './useUserProfile'

const subscribeUserProfile = vi.fn()
vi.mock('../api/profileRepository', () => ({
  subscribeUserProfile: (...args: unknown[]) => subscribeUserProfile(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  subscribeUserProfile.mockReset()
  useAuth.mockReset()
})

function Probe() {
  const state = useUserProfile()
  return <p>status:{state.status}</p>
}

describe('useUserProfile', () => {
  it('does not subscribe while the auth session is still loading', () => {
    useAuth.mockReturnValue({ status: 'loading', user: null })
    render(<Probe />)
    expect(subscribeUserProfile).not.toHaveBeenCalled()
    expect(screen.getByText('status:loading')).toBeInTheDocument()
  })

  it('does not subscribe when signed out', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    render(<Probe />)
    expect(subscribeUserProfile).not.toHaveBeenCalled()
  })

  it('subscribes exactly once for a signed-in user and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeUserProfile.mockReturnValueOnce(unsubscribe)
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    const { unmount } = render(<Probe />)

    expect(subscribeUserProfile).toHaveBeenCalledTimes(1)
    expect(subscribeUserProfile).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes the old listener and subscribes a new one when the uid changes', () => {
    const unsubscribeA = vi.fn()
    const unsubscribeB = vi.fn()
    subscribeUserProfile.mockReturnValueOnce(unsubscribeA).mockReturnValueOnce(unsubscribeB)

    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    const { rerender } = render(<Probe />)
    expect(subscribeUserProfile).toHaveBeenCalledTimes(1)

    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'bob' } })
    rerender(<Probe />)

    expect(unsubscribeA).toHaveBeenCalledTimes(1)
    expect(subscribeUserProfile).toHaveBeenCalledTimes(2)
    expect(subscribeUserProfile).toHaveBeenLastCalledWith('bob', expect.any(Function), expect.any(Function))
  })

  // Regression coverage for a real incident: a Firebase Auth user existed
  // (created long before the local Functions emulator's onUserCreate
  // trigger ever successfully loaded this session) with no matching
  // users/{uid} document, and the Account page showed a misleading result.
  // A missing profile must be labeled "provisioning" (optimistic, self-heals
  // as soon as the document arrives) only while the account is genuinely
  // recent — never indefinitely, and never for an account old enough that
  // "still setting up" would be dishonest.
  describe('missing profile document', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('reports "provisioning" — not "missing" — for a just-created account with no profile document yet', () => {
      let onData: (profile: unknown) => void = () => {}
      subscribeUserProfile.mockImplementationOnce((_uid, next: typeof onData) => {
        onData = next
        return vi.fn()
      })
      useAuth.mockReturnValue({
        status: 'authenticated',
        user: { uid: 'alice', metadata: { creationTime: new Date().toUTCString() } },
      })

      render(<Probe />)
      act(() => onData(null))

      expect(screen.getByText('status:provisioning')).toBeInTheDocument()
    })

    it('downgrades from "provisioning" to "missing" once the grace period elapses without the document appearing', () => {
      vi.useFakeTimers()
      let onData: (profile: unknown) => void = () => {}
      subscribeUserProfile.mockImplementationOnce((_uid, next: typeof onData) => {
        onData = next
        return vi.fn()
      })
      useAuth.mockReturnValue({
        status: 'authenticated',
        user: { uid: 'alice', metadata: { creationTime: new Date().toUTCString() } },
      })

      render(<Probe />)
      act(() => onData(null))
      expect(screen.getByText('status:provisioning')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(8_000)
      })

      expect(screen.getByText('status:missing')).toBeInTheDocument()
    })

    it('reports "missing" immediately for an account old enough that "still setting up" would be dishonest', () => {
      let onData: (profile: unknown) => void = () => {}
      subscribeUserProfile.mockImplementationOnce((_uid, next: typeof onData) => {
        onData = next
        return vi.fn()
      })
      useAuth.mockReturnValue({
        status: 'authenticated',
        user: { uid: 'alice', metadata: { creationTime: new Date(0).toUTCString() } },
      })

      render(<Probe />)
      act(() => onData(null))

      expect(screen.getByText('status:missing')).toBeInTheDocument()
    })

    it('reports "missing" (never crashes) when the auth user has no metadata at all', () => {
      let onData: (profile: unknown) => void = () => {}
      subscribeUserProfile.mockImplementationOnce((_uid, next: typeof onData) => {
        onData = next
        return vi.fn()
      })
      useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

      render(<Probe />)
      act(() => onData(null))

      expect(screen.getByText('status:missing')).toBeInTheDocument()
    })
  })
})

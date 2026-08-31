import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})

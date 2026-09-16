import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddresses } from './useAddresses'

const subscribeAddresses = vi.fn()
vi.mock('../api/addressRepository', () => ({
  subscribeAddresses: (...args: unknown[]) => subscribeAddresses(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  subscribeAddresses.mockReset()
  useAuth.mockReset()
})

function Probe() {
  const state = useAddresses()
  return <p>status:{state.status}</p>
}

describe('useAddresses', () => {
  it('does not subscribe while signed out — the address book is authenticated-only, no guest mode', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    render(<Probe />)
    expect(subscribeAddresses).not.toHaveBeenCalled()
    expect(screen.getByText('status:loading')).toBeInTheDocument()
  })

  it('does not subscribe while the auth session is still loading', () => {
    useAuth.mockReturnValue({ status: 'loading', user: null })
    render(<Probe />)
    expect(subscribeAddresses).not.toHaveBeenCalled()
  })

  it('subscribes exactly once for a signed-in user and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeAddresses.mockReturnValueOnce(unsubscribe)
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    const { unmount } = render(<Probe />)

    expect(subscribeAddresses).toHaveBeenCalledTimes(1)
    expect(subscribeAddresses).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes the old listener and subscribes a new one when the uid changes', () => {
    const unsubscribeA = vi.fn()
    const unsubscribeB = vi.fn()
    subscribeAddresses.mockReturnValueOnce(unsubscribeA).mockReturnValueOnce(unsubscribeB)

    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    const { rerender } = render(<Probe />)
    expect(subscribeAddresses).toHaveBeenCalledTimes(1)

    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'bob' } })
    rerender(<Probe />)

    expect(unsubscribeA).toHaveBeenCalledTimes(1)
    expect(subscribeAddresses).toHaveBeenCalledTimes(2)
    expect(subscribeAddresses).toHaveBeenLastCalledWith('bob', expect.any(Function), expect.any(Function))
  })

  it('reports loaded with the real addresses once the listener delivers them', () => {
    let onData: (addresses: unknown[]) => void = () => {}
    subscribeAddresses.mockImplementationOnce((_uid, next: typeof onData) => {
      onData = next
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    render(<Probe />)
    act(() => onData([{ id: 'a1' }]))
    expect(screen.getByText('status:loaded')).toBeInTheDocument()
  })

  it('reports error when the listener fails', () => {
    let onError: (error: unknown) => void = () => {}
    subscribeAddresses.mockImplementationOnce((_uid, _onData, next: typeof onError) => {
      onError = next
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    render(<Probe />)
    act(() => onError({ code: 'unknown', message: 'Something went wrong. Please try again.' }))
    expect(screen.getByText('status:error')).toBeInTheDocument()
  })
})

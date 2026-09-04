import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSellerArtworks } from './useSellerArtworks'

const subscribeSellerArtworks = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  subscribeSellerArtworks: (...args: unknown[]) => subscribeSellerArtworks(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  subscribeSellerArtworks.mockReset()
  useAuth.mockReset()
})

function Probe() {
  const state = useSellerArtworks()
  return <p>status:{state.status}</p>
}

describe('useSellerArtworks', () => {
  it('does not subscribe while signed out', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    render(<Probe />)
    expect(subscribeSellerArtworks).not.toHaveBeenCalled()
  })

  it('subscribes exactly once for the signed-in seller and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeSellerArtworks.mockReturnValueOnce(unsubscribe)
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    const { unmount } = render(<Probe />)

    expect(subscribeSellerArtworks).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('reports the loaded artwork list', () => {
    subscribeSellerArtworks.mockImplementationOnce((_uid, onData: (a: unknown[]) => void) => {
      onData([{ id: 'a1' }])
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    render(<Probe />)
    expect(screen.getByText('status:loaded')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSellerStatus } from './useSellerStatus'

const subscribeSellerApplication = vi.fn()
vi.mock('../api/sellerRepository', () => ({
  subscribeSellerApplication: (...args: unknown[]) => subscribeSellerApplication(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  subscribeSellerApplication.mockReset()
  useAuth.mockReset()
})

function Probe() {
  const state = useSellerStatus()
  return <p>status:{state.status}</p>
}

describe('useSellerStatus', () => {
  it('does not subscribe while the auth session is loading', () => {
    useAuth.mockReturnValue({ status: 'loading', user: null })
    render(<Probe />)
    expect(subscribeSellerApplication).not.toHaveBeenCalled()
    expect(screen.getByText('status:loading')).toBeInTheDocument()
  })

  it('reports not-applied when no application document exists', () => {
    subscribeSellerApplication.mockImplementationOnce((_uid, onData: (a: unknown) => void) => {
      onData(null)
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    render(<Probe />)
    expect(screen.getByText('status:not-applied')).toBeInTheDocument()
  })

  it('reports pending for a PENDING application', () => {
    subscribeSellerApplication.mockImplementationOnce((_uid, onData: (a: unknown) => void) => {
      onData({ status: 'PENDING' })
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    render(<Probe />)
    expect(screen.getByText('status:pending')).toBeInTheDocument()
  })

  it('reports approved for an APPROVED application', () => {
    subscribeSellerApplication.mockImplementationOnce((_uid, onData: (a: unknown) => void) => {
      onData({ status: 'APPROVED' })
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    render(<Probe />)
    expect(screen.getByText('status:approved')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeSellerApplication.mockReturnValueOnce(unsubscribe)
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })

    const { unmount } = render(<Probe />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

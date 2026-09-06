import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtistProfile } from './useArtistProfile'

const subscribeArtistProfile = vi.fn()
vi.mock('../api/artistProfileRepository', () => ({
  subscribeArtistProfile: (...args: unknown[]) => subscribeArtistProfile(...args),
}))

beforeEach(() => {
  subscribeArtistProfile.mockReset()
})

function Probe({ uid }: { uid: string | undefined }) {
  const state = useArtistProfile(uid)
  return <p>status:{state.status}</p>
}

describe('useArtistProfile', () => {
  it('reports missing without subscribing when uid is undefined', () => {
    render(<Probe uid={undefined} />)
    expect(subscribeArtistProfile).not.toHaveBeenCalled()
    expect(screen.getByText('status:missing')).toBeInTheDocument()
  })

  it('subscribes for a given uid and reports the loaded profile', () => {
    subscribeArtistProfile.mockImplementationOnce((_uid, onData: (p: unknown) => void) => {
      onData({ uid: 'alice' })
      return vi.fn()
    })
    render(<Probe uid="alice" />)
    expect(subscribeArtistProfile).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))
    expect(screen.getByText('status:loaded')).toBeInTheDocument()
  })

  it('reports missing when no profile exists for that uid', () => {
    subscribeArtistProfile.mockImplementationOnce((_uid, onData: (p: unknown) => void) => {
      onData(null)
      return vi.fn()
    })
    render(<Probe uid="does-not-exist" />)
    expect(screen.getByText('status:missing')).toBeInTheDocument()
  })

  it('reports the error state on a listener error', () => {
    subscribeArtistProfile.mockImplementationOnce((_uid, _onData, onError: (e: unknown) => void) => {
      onError({ code: 'unknown', message: 'boom' })
      return vi.fn()
    })
    render(<Probe uid="alice" />)
    expect(screen.getByText('status:error')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeArtistProfile.mockReturnValueOnce(unsubscribe)
    const { unmount } = render(<Probe uid="alice" />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

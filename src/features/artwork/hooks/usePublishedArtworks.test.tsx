import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePublishedArtworks } from './usePublishedArtworks'

const subscribePublishedArtworks = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  subscribePublishedArtworks: (...args: unknown[]) => subscribePublishedArtworks(...args),
}))

beforeEach(() => {
  subscribePublishedArtworks.mockReset()
})

function Probe({ sellerId }: { sellerId: string | undefined }) {
  const state = usePublishedArtworks(sellerId)
  return <p>status:{state.status}{state.status === 'loaded' ? `:${state.artworks.length}` : ''}</p>
}

describe('usePublishedArtworks', () => {
  it('reports an empty loaded list without subscribing when sellerId is undefined', () => {
    render(<Probe sellerId={undefined} />)
    expect(subscribePublishedArtworks).not.toHaveBeenCalled()
    expect(screen.getByText('status:loaded:0')).toBeInTheDocument()
  })

  it('subscribes for a given sellerId and reports the loaded artworks', () => {
    subscribePublishedArtworks.mockImplementationOnce((_sellerId, onData: (a: unknown[]) => void) => {
      onData([{ id: 'a1' }, { id: 'a2' }])
      return vi.fn()
    })
    render(<Probe sellerId="alice" />)
    expect(subscribePublishedArtworks).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))
    expect(screen.getByText('status:loaded:2')).toBeInTheDocument()
  })

  it('reports the error state on a listener error', () => {
    subscribePublishedArtworks.mockImplementationOnce((_sellerId, _onData, onError: (e: unknown) => void) => {
      onError({ code: 'unknown', message: 'boom' })
      return vi.fn()
    })
    render(<Probe sellerId="alice" />)
    expect(screen.getByText('status:error')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribePublishedArtworks.mockReturnValueOnce(unsubscribe)
    const { unmount } = render(<Probe sellerId="alice" />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

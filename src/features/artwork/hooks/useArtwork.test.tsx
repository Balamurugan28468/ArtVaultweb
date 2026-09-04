import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtwork } from './useArtwork'

const subscribeArtwork = vi.fn()
vi.mock('../api/artworkRepository', () => ({ subscribeArtwork: (...args: unknown[]) => subscribeArtwork(...args) }))

beforeEach(() => {
  subscribeArtwork.mockReset()
})

function Probe({ id }: { id: string | undefined }) {
  const state = useArtwork(id)
  return <p>status:{state.status}</p>
}

describe('useArtwork', () => {
  it('reports missing without subscribing when id is undefined (create-mode)', () => {
    render(<Probe id={undefined} />)
    expect(subscribeArtwork).not.toHaveBeenCalled()
    expect(screen.getByText('status:missing')).toBeInTheDocument()
  })

  it('subscribes for a given id and reports the loaded artwork', () => {
    subscribeArtwork.mockImplementationOnce((_id, onData: (a: unknown) => void) => {
      onData({ id: 'a1' })
      return vi.fn()
    })
    render(<Probe id="a1" />)
    expect(subscribeArtwork).toHaveBeenCalledWith('a1', expect.any(Function), expect.any(Function))
    expect(screen.getByText('status:loaded')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeArtwork.mockReturnValueOnce(unsubscribe)
    const { unmount } = render(<Probe id="a1" />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

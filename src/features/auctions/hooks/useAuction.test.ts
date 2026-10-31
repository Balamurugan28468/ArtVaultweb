import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const viewer = vi.hoisted(() => ({ user: null as { uid: string } | null }))
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => viewer }))

const realtime = vi.hoisted(() => {
  const handlers: { filter: Record<string,string>; notify: () => void }[] = []
  const channel = { on: vi.fn((_event: string, filter: Record<string,string>, notify: () => void) => { handlers.push({ filter,notify }); return channel }), subscribe: vi.fn(() => channel) }
  return { handlers,channel,removeChannel: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => realtime.channel, removeChannel: realtime.removeChannel }) }))
beforeEach(() => { viewer.user=null; realtime.handlers.length=0; vi.clearAllMocks(); getAuction.mockReset(); getPublicArtwork.mockReset() })

const getAuction = vi.fn()
vi.mock('../api/auctionsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auctionsRepository')>()
  return { ...actual, getAuction: (id: string,lotId?:string) => getAuction(id,lotId) }
})

it('refreshes winner state from sanitized signals only and cleans up without a real WebSocket', async () => {
  getAuction.mockResolvedValue({ id: 'a1', artworkId: 'artwork-1', lotStatus: 'OPEN' })
  getPublicArtwork.mockResolvedValue({ id: 'artwork-1' })
  const view = renderHook(() => useAuction('a1'))
  await waitFor(() => expect(view.result.current.status).toBe('loaded'))
  expect(realtime.handlers.map(h => h.filter)).toEqual([
    { event: '*', schema: 'public', table: 'auction_realtime_signals', filter: 'auction_id=eq.a1' },
  ])
  getAuction.mockResolvedValue({ id: 'a1', artworkId: 'artwork-1', lotStatus: 'WINNER_PENDING' })
  await act(async () => { realtime.handlers[0].notify() })
  expect(view.result.current).toMatchObject({ status: 'loaded', auction: { lotStatus: 'WINNER_PENDING' } })
  view.unmount()
  expect(realtime.removeChannel).toHaveBeenCalledExactlyOnceWith(realtime.channel)
})

it('reloads caller-specific winner state after an account changes', async () => {
  viewer.user={uid:'winner'}
  getAuction.mockResolvedValue({ id:'a1',artworkId:'artwork-1',isWinner:true })
  getPublicArtwork.mockResolvedValue(null)
  const view=renderHook(() => useAuction('a1'))
  await waitFor(() => expect(view.result.current).toMatchObject({status:'loaded',auction:{isWinner:true}}))
  getAuction.mockResolvedValue({ id:'a1',artworkId:'artwork-1',isWinner:false })
  viewer.user={uid:'loser'}
  view.rerender()
  await waitFor(() => expect(view.result.current).toMatchObject({status:'loaded',auction:{isWinner:false}}))
  expect(realtime.removeChannel).toHaveBeenCalledTimes(1)
})

const getPublicArtwork = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, getPublicArtwork: (id: string) => getPublicArtwork(id) }
})

const { useAuction } = await import('./useAuction')

it('recovers missed lot updates on reconnect and focus, then removes focus handling', async () => {
  getAuction.mockResolvedValue({ id: 'a1', artworkId: 'artwork-1', lotStatus: 'OPEN' })
  getPublicArtwork.mockResolvedValue(null)
  const view = renderHook(() => useAuction('a1'))
  await waitFor(() => expect(view.result.current.status).toBe('loaded'))
  const subscribe = realtime.channel.subscribe as unknown as { mock: { calls: [(status: string) => void][] } }
  getAuction.mockResolvedValue({ id: 'a1', artworkId: 'artwork-1', lotStatus: 'WINNER_PENDING' })
  await act(async () => { subscribe.mock.calls[0][0]('SUBSCRIBED') })
  expect(view.result.current).toMatchObject({ auction: { lotStatus: 'WINNER_PENDING' } })
  getAuction.mockResolvedValue({ id: 'a1', artworkId: 'artwork-1', lotStatus: 'PAYMENT_EXPIRED' })
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(view.result.current).toMatchObject({ auction: { lotStatus: 'PAYMENT_EXPIRED' } })
  view.unmount()
  const count = getAuction.mock.calls.length
  await act(async () => { window.dispatchEvent(new Event('focus')); subscribe.mock.calls[0][0]('SUBSCRIBED') })
  expect(getAuction).toHaveBeenCalledTimes(count)
})

it('ignores old channel reconnect and signal callbacks after changing the route', async () => {
  getAuction.mockImplementation(async (id: string) => ({ id, artworkId: 'artwork-1' }))
  getPublicArtwork.mockResolvedValue(null)
  const view = renderHook(({ id }) => useAuction(id), { initialProps: { id: 'a1' } })
  await waitFor(() => expect(view.result.current).toMatchObject({ auction: { id: 'a1' } }))
  const subscribe = realtime.channel.subscribe as unknown as { mock: { calls: [(status: string) => void][] } }
  const oldReconnect = subscribe.mock.calls[0][0]
  const oldSignal = realtime.handlers[0].notify
  view.rerender({ id: 'a2' })
  await waitFor(() => expect(view.result.current).toMatchObject({ auction: { id: 'a2' } }))
  const count = getAuction.mock.calls.length
  await act(async () => { oldReconnect('SUBSCRIBED'); oldSignal() })
  expect(getAuction).toHaveBeenCalledTimes(count)
  expect(view.result.current).toMatchObject({ auction: { id: 'a2' } })
})

it('changes between lots in one weekly event without showing the first lot again',async()=>{
  getAuction.mockImplementation(async(id:string,lotId:string)=>({id,auctionItemId:lotId,artworkId:`art-${lotId}`}))
  getPublicArtwork.mockResolvedValue(null)
  const view=renderHook(({lot})=>useAuction('weekly',lot),{initialProps:{lot:'one'}})
  await waitFor(()=>expect(view.result.current).toMatchObject({status:'loaded',auction:{auctionItemId:'one'}}))
  view.rerender({lot:'two'})
  await waitFor(()=>expect(view.result.current).toMatchObject({status:'loaded',auction:{auctionItemId:'two'}}))
  expect(getAuction).toHaveBeenCalledWith('weekly','two')
})

describe('useAuction', () => {
  it('is missing when no auctionId is given', () => {
    const { result } = renderHook(() => useAuction(undefined))
    expect(result.current).toEqual({ status: 'missing', reload: expect.any(Function) })
  })

  it('is missing when the auction genuinely does not exist — never a fabricated auction', async () => {
    getAuction.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAuction('a1'))
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('loads the real auction plus its linked artwork', async () => {
    getAuction.mockResolvedValueOnce({ id: 'a1', artworkId: 'artwork-1' })
    getPublicArtwork.mockResolvedValueOnce({ id: 'artwork-1', title: 'Starry Reflections' })
    const { result } = renderHook(() => useAuction('a1'))

    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({
      status: 'loaded',
      auction: { id: 'a1', artworkId: 'artwork-1' },
      artwork: { id: 'artwork-1', title: 'Starry Reflections' },
      reload: expect.any(Function),
    })
  })

  it('still loads the auction when the linked artwork is unavailable, rather than hiding the whole auction', async () => {
    getAuction.mockResolvedValueOnce({ id: 'a1', artworkId: 'artwork-1' })
    getPublicArtwork.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAuction('a1'))

    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toMatchObject({ status: 'loaded', artwork: null })
  })
})

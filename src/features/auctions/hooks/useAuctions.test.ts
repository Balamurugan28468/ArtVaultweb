import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({user:null}) }))

const realtime = vi.hoisted(() => {
  const notifications: (() => void)[] = []
  const channel = { on: vi.fn((_event: string, _filter: unknown, notify: () => void) => { notifications.push(notify); return channel }), subscribe: vi.fn(() => channel) }
  return { notifications,channel,removeChannel: vi.fn().mockResolvedValue(undefined) }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => realtime.channel, removeChannel: realtime.removeChannel }) }))
beforeEach(() => { realtime.notifications.length=0; vi.clearAllMocks(); fetchAllAuctions.mockReset() })

const fetchAllAuctions = vi.fn()
vi.mock('../api/auctionsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auctionsRepository')>()
  return { ...actual, fetchAllAuctions: () => fetchAllAuctions() }
})

it('refreshes automatic activation and unsubscribes when the catalog unmounts', async () => {
  fetchAllAuctions.mockResolvedValue([{ id:'a1', auctionStatus:'SCHEDULED' }])
  const view = renderHook(() => useAuctions())
  await waitFor(() => expect(view.result.current.status).toBe('loaded'))
  expect(realtime.channel.on).toHaveBeenCalledExactlyOnceWith('postgres_changes',
    {event:'*',schema:'public',table:'auction_realtime_signals'},expect.any(Function))
  fetchAllAuctions.mockResolvedValue([{ id:'a1', auctionStatus:'LIVE' }])
  await act(async () => { realtime.notifications[0]() })
  expect(view.result.current).toEqual({ status:'loaded', auctions:[{id:'a1',auctionStatus:'LIVE'}] })
  view.unmount()
  expect(realtime.removeChannel).toHaveBeenCalledExactlyOnceWith(realtime.channel)
})

const { useAuctions } = await import('./useAuctions')

it('refreshes missed catalog updates on reconnect and focus without leaking listeners', async () => {
  fetchAllAuctions.mockResolvedValue([{ id: 'a1', auctionStatus: 'SCHEDULED' }])
  const view = renderHook(() => useAuctions())
  await waitFor(() => expect(view.result.current.status).toBe('loaded'))
  const subscribe = realtime.channel.subscribe as unknown as { mock: { calls: [(status: string) => void][] } }
  fetchAllAuctions.mockResolvedValue([{ id: 'a1', auctionStatus: 'LIVE' }])
  await act(async () => { subscribe.mock.calls[0][0]('SUBSCRIBED') })
  expect(view.result.current).toMatchObject({ auctions: [{ auctionStatus: 'LIVE' }] })
  fetchAllAuctions.mockResolvedValue([{ id: 'a1', auctionStatus: 'ENDED' }])
  await act(async () => { window.dispatchEvent(new Event('focus')) })
  expect(view.result.current).toMatchObject({ auctions: [{ auctionStatus: 'ENDED' }] })
  view.unmount()
  const count = fetchAllAuctions.mock.calls.length
  await act(async () => { window.dispatchEvent(new Event('focus')); subscribe.mock.calls[0][0]('SUBSCRIBED') })
  expect(fetchAllAuctions).toHaveBeenCalledTimes(count)
})

describe('useAuctions', () => {
  it('starts loading, then resolves to the real fetched list', async () => {
    fetchAllAuctions.mockResolvedValueOnce([{ id: 'a1' }])
    const { result } = renderHook(() => useAuctions())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({ status: 'loaded', auctions: [{ id: 'a1' }] })
  })

  it('resolves to an empty list rather than fabricating auctions when none exist', async () => {
    fetchAllAuctions.mockResolvedValueOnce([])
    const { result } = renderHook(() => useAuctions())
    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({ status: 'loaded', auctions: [] })
  })

  it('surfaces a real fetch failure as an error state', async () => {
    fetchAllAuctions.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useAuctions())
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})

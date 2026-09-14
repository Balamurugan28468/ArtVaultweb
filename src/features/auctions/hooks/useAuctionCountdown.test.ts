import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCountdown, splitCountdown, useAuctionCountdown } from './useAuctionCountdown'

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

describe('splitCountdown', () => {
  it('splits a duration into whole days/hours/minutes/seconds, agreeing with formatCountdown', () => {
    const ms = ((3 * 24 + 12) * 3600 + 45 * 60 + 18) * 1000
    expect(splitCountdown(ms)).toEqual({ days: 3, hours: 12, minutes: 45, seconds: 18 })
  })
})

describe('formatCountdown', () => {
  it('formats days, hours, minutes, and seconds', () => {
    expect(formatCountdown(((3 * 24 + 12) * 3600 + 45 * 60 + 18) * 1000)).toBe('3d 12h 45m 18s')
  })

  it('omits days when under a day, still shows hours', () => {
    expect(formatCountdown((2 * 3600 + 5 * 60 + 9) * 1000)).toBe('2h 5m 9s')
  })

  it('omits days and hours when under an hour', () => {
    expect(formatCountdown((5 * 60 + 9) * 1000)).toBe('5m 9s')
  })
})

describe('useAuctionCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(500))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports SCHEDULED with time remaining until startAt', () => {
    const { result } = renderHook(() => useAuctionCountdown({ startAt: ts(1000), endAt: ts(2000) }))
    expect(result.current.status).toBe('SCHEDULED')
    expect(result.current.remainingMs).toBe(500)
  })

  it('reports LIVE with time remaining until endAt, and re-ticks on the interval', () => {
    vi.setSystemTime(new Date(1500))
    const { result } = renderHook(() => useAuctionCountdown({ startAt: ts(1000), endAt: ts(10000) }))
    expect(result.current.status).toBe('LIVE')
    expect(result.current.remainingMs).toBe(8500)

    // advanceTimersByTime moves the fake clock itself forward (not just
    // firing pending timers), so this both triggers the 1s interval tick
    // and genuinely advances "now" by the same 1000ms.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.remainingMs).toBe(7500)
  })

  it('reports ENDED with zero remaining once past endAt', () => {
    vi.setSystemTime(new Date(5000))
    const { result } = renderHook(() => useAuctionCountdown({ startAt: ts(1000), endAt: ts(2000) }))
    expect(result.current.status).toBe('ENDED')
    expect(result.current.remainingMs).toBe(0)
  })
})

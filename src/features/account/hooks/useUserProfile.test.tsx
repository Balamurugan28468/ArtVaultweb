import {
  act,
  render,
  screen,
} from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  useUserProfile,
} from './useUserProfile'

const subscribeUserProfile =
  vi.fn()

vi.mock(
  '../api/profileRepository',
  () => ({
    subscribeUserProfile:
      (...args: unknown[]) =>
        subscribeUserProfile(
          ...args,
        ),
  }),
)

const useAuth =
  vi.fn()

vi.mock(
  '@/app/providers/AuthProvider',
  () => ({
    useAuth:
      () => useAuth(),
  }),
)

beforeEach(() => {
  subscribeUserProfile.mockReset()
  useAuth.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function Probe() {
  const state =
    useUserProfile()

  return (
    <p>
      status:{state.status}
    </p>
  )
}

describe(
  'useUserProfile',
  () => {
    it('does not subscribe while the auth session is still loading', () => {
      useAuth.mockReturnValue({
        status: 'loading',
        user: null,
      })

      render(
        <Probe />,
      )

      expect(
        subscribeUserProfile,
      ).not.toHaveBeenCalled()

      expect(
        screen.getByText(
          'status:loading',
        ),
      ).toBeInTheDocument()
    })

    it('does not subscribe when signed out', () => {
      useAuth.mockReturnValue({
        status:
          'unauthenticated',
        user: null,
      })

      render(
        <Probe />,
      )

      expect(
        subscribeUserProfile,
      ).not.toHaveBeenCalled()
    })

    it('subscribes exactly once for a signed-in user and unsubscribes on unmount', () => {
      const unsubscribe =
        vi.fn()

      subscribeUserProfile.mockReturnValueOnce(
        unsubscribe,
      )

      useAuth.mockReturnValue({
        status:
          'authenticated',
        user: {
          uid: 'alice',
          createdAt:
            '2026-09-01T00:00:00.000Z',
        },
      })

      const {
        unmount,
      } = render(
        <Probe />,
      )

      expect(
        subscribeUserProfile,
      ).toHaveBeenCalledTimes(1)

      expect(
        subscribeUserProfile,
      ).toHaveBeenCalledWith(
        'alice',
        expect.any(Function),
        expect.any(Function),
      )

      unmount()

      expect(
        unsubscribe,
      ).toHaveBeenCalledTimes(1)
    })

    it('unsubscribes the old listener and subscribes a new one when the uid changes', () => {
      const unsubscribeA =
        vi.fn()

      const unsubscribeB =
        vi.fn()

      subscribeUserProfile
        .mockReturnValueOnce(
          unsubscribeA,
        )
        .mockReturnValueOnce(
          unsubscribeB,
        )

      useAuth.mockReturnValue({
        status:
          'authenticated',
        user: {
          uid: 'alice',
          createdAt:
            '2026-09-01T00:00:00.000Z',
        },
      })

      const {
        rerender,
      } = render(
        <Probe />,
      )

      expect(
        subscribeUserProfile,
      ).toHaveBeenCalledTimes(1)

      useAuth.mockReturnValue({
        status:
          'authenticated',
        user: {
          uid: 'bob',
          createdAt:
            '2026-09-01T00:00:00.000Z',
        },
      })

      rerender(
        <Probe />,
      )

      expect(
        unsubscribeA,
      ).toHaveBeenCalledTimes(1)

      expect(
        subscribeUserProfile,
      ).toHaveBeenCalledTimes(2)

      expect(
        subscribeUserProfile,
      ).toHaveBeenLastCalledWith(
        'bob',
        expect.any(Function),
        expect.any(Function),
      )
    })

    describe(
      'missing profile row',
      () => {
        it('reports provisioning for a newly-created Supabase account whose profile trigger has not become visible yet', () => {
          let onData:
            (
              profile: unknown,
            ) => void =
              () => {}

          subscribeUserProfile.mockImplementationOnce(
            (
              _uid,
              next:
                typeof onData,
            ) => {
              onData = next
              return vi.fn()
            },
          )

          useAuth.mockReturnValue({
            status:
              'authenticated',
            user: {
              uid: 'alice',
              createdAt:
                new Date().toISOString(),
            },
          })

          render(
            <Probe />,
          )

          act(() => {
            onData(null)
          })

          expect(
            screen.getByText(
              'status:provisioning',
            ),
          ).toBeInTheDocument()
        })

        it('downgrades provisioning to missing once the grace period expires', () => {
          vi.useFakeTimers()

          vi.setSystemTime(
            new Date(
              '2026-09-20T10:00:00.000Z',
            ),
          )

          let onData:
            (
              profile: unknown,
            ) => void =
              () => {}

          subscribeUserProfile.mockImplementationOnce(
            (
              _uid,
              next:
                typeof onData,
            ) => {
              onData = next
              return vi.fn()
            },
          )

          useAuth.mockReturnValue({
            status:
              'authenticated',
            user: {
              uid: 'alice',
              createdAt:
                '2026-09-20T10:00:00.000Z',
            },
          })

          render(
            <Probe />,
          )

          act(() => {
            onData(null)
          })

          expect(
            screen.getByText(
              'status:provisioning',
            ),
          ).toBeInTheDocument()

          act(() => {
            vi.advanceTimersByTime(
              8_000,
            )
          })

          expect(
            screen.getByText(
              'status:missing',
            ),
          ).toBeInTheDocument()
        })

        it('reports missing immediately for an older account', () => {
          let onData:
            (
              profile: unknown,
            ) => void =
              () => {}

          subscribeUserProfile.mockImplementationOnce(
            (
              _uid,
              next:
                typeof onData,
            ) => {
              onData = next
              return vi.fn()
            },
          )

          useAuth.mockReturnValue({
            status:
              'authenticated',
            user: {
              uid: 'alice',
              createdAt:
                new Date(
                  Date.now() -
                    60_000,
                ).toISOString(),
            },
          })

          render(
            <Probe />,
          )

          act(() => {
            onData(null)
          })

          expect(
            screen.getByText(
              'status:missing',
            ),
          ).toBeInTheDocument()
        })

        it('reports missing without crashing when the auth user has no createdAt timestamp', () => {
          let onData:
            (
              profile: unknown,
            ) => void =
              () => {}

          subscribeUserProfile.mockImplementationOnce(
            (
              _uid,
              next:
                typeof onData,
            ) => {
              onData = next
              return vi.fn()
            },
          )

          useAuth.mockReturnValue({
            status:
              'authenticated',
            user: {
              uid: 'alice',
            },
          })

          render(
            <Probe />,
          )

          act(() => {
            onData(null)
          })

          expect(
            screen.getByText(
              'status:missing',
            ),
          ).toBeInTheDocument()
        })
      },
    )
  },
)
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

type AuthStateCallback = (user: { uid: string } | null) => void

const authStateCallbacks: AuthStateCallback[] = []
const getIdTokenResult = vi.fn()
const ensureUserProfile = vi.fn()

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null } }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: AuthStateCallback) => {
    authStateCallbacks.push(callback)
    return () => {}
  },
  getIdTokenResult: (...args: unknown[]) => getIdTokenResult(...args),
}))
vi.mock('@/features/auth/api/ensureUserProfile', () => ({
  ensureUserProfile: (...args: unknown[]) => ensureUserProfile(...args),
}))

function Probe() {
  const { status, role } = useAuth()
  return (
    <p>
      {status}:{role ?? 'none'}
    </p>
  )
}

beforeEach(() => {
  authStateCallbacks.length = 0
  getIdTokenResult.mockReset()
  ensureUserProfile.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AuthProvider', () => {
  it('starts loading, then reflects unauthenticated when there is no restored session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByText('loading:none')).toBeInTheDocument()

    act(() => authStateCallbacks[0]?.(null))

    expect(await screen.findByText('unauthenticated:none')).toBeInTheDocument()
    expect(ensureUserProfile).not.toHaveBeenCalled()
  })

  it('reflects authenticated with the role claim once a session is restored', async () => {
    getIdTokenResult.mockResolvedValue({ claims: { role: 'CUSTOMER' } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    act(() => authStateCallbacks[0]?.({ uid: 'alice' }))

    expect(await screen.findByText('authenticated:CUSTOMER')).toBeInTheDocument()
  })

  it('ignores a stale role lookup from a superseded auth-state change', async () => {
    let resolveFirstLookup!: (value: { claims: { role: string } }) => void
    getIdTokenResult
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstLookup = resolve
          }),
      )
      .mockResolvedValueOnce({ claims: { role: 'SELLER' } })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    // First auth-state change (slow lookup, not resolved yet), immediately
    // superseded by a second one (fast lookup, resolves first).
    act(() => authStateCallbacks[0]?.({ uid: 'alice' }))
    act(() => authStateCallbacks[0]?.({ uid: 'bob' }))

    expect(await screen.findByText('authenticated:SELLER')).toBeInTheDocument()

    // The stale first lookup finally resolves — must not overwrite bob's role.
    await act(async () => {
      resolveFirstLookup({ claims: { role: 'CUSTOMER' } })
    })

    expect(screen.getByText('authenticated:SELLER')).toBeInTheDocument()
  })

  // Regression coverage: users/{uid} used to depend entirely on the
  // asynchronous onUserCreate Cloud Function trigger. AuthProvider now
  // guarantees the canonical profile exists — for both a normal sign-in and
  // a persisted-session restore, since both fire through this same
  // onAuthStateChanged handler — before ever exposing "authenticated".
  describe('canonical profile guarantee', () => {
    it('calls ensureUserProfile with the resolved CUSTOMER claim before becoming authenticated', async () => {
      getIdTokenResult.mockResolvedValue({ claims: { role: 'CUSTOMER' } })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
      act(() => authStateCallbacks[0]?.({ uid: 'alice' }))

      await screen.findByText('authenticated:CUSTOMER')
      expect(ensureUserProfile).toHaveBeenCalledWith({ uid: 'alice' }, { role: 'CUSTOMER' })
    })

    it('preserves a trusted SELLER claim — recovery never downgrades a real seller to CUSTOMER', async () => {
      getIdTokenResult.mockResolvedValue({ claims: { role: 'SELLER' } })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
      act(() => authStateCallbacks[0]?.({ uid: 'alice' }))

      await screen.findByText('authenticated:SELLER')
      expect(ensureUserProfile).toHaveBeenCalledWith({ uid: 'alice' }, { role: 'SELLER' })
    })

    it('defaults to CUSTOMER when no role claim exists at all yet', async () => {
      // waitForRoleClaim genuinely retries for ~6s (12 × 500ms) in real time
      // before giving up when the claim never appears — fake timers avoid
      // actually waiting that long, and avoid leaving real setTimeout
      // callbacks pending into later tests.
      vi.useFakeTimers()
      getIdTokenResult.mockResolvedValue({ claims: {} })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
      act(() => authStateCallbacks[0]?.({ uid: 'alice' }))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(12 * 500)
      })

      expect(screen.getByText('authenticated:none')).toBeInTheDocument()
      expect(ensureUserProfile).toHaveBeenCalledWith({ uid: 'alice' }, { role: 'CUSTOMER' })

      vi.useRealTimers()
    })

    it('still resolves to authenticated (no infinite loading) when profile provisioning genuinely fails', async () => {
      getIdTokenResult.mockResolvedValue({ claims: { role: 'CUSTOMER' } })
      ensureUserProfile.mockRejectedValueOnce(new Error('Firestore unreachable'))

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )
      act(() => authStateCallbacks[0]?.({ uid: 'alice' }))

      expect(await screen.findByText('authenticated:CUSTOMER')).toBeInTheDocument()
      // eslint-disable-next-line no-console -- asserting the failure was logged, not silently swallowed
      expect(console.error).toHaveBeenCalledWith('Failed to ensure user profile:', expect.any(Error))
    })
  })
})

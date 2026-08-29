import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

type AuthStateCallback = (user: { uid: string } | null) => void

const authStateCallbacks: AuthStateCallback[] = []
const getIdTokenResult = vi.fn()

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null } }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: AuthStateCallback) => {
    authStateCallbacks.push(callback)
    return () => {}
  },
  getIdTokenResult: (...args: unknown[]) => getIdTokenResult(...args),
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
})

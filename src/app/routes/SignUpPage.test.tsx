import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignUpPage } from './SignUpPage'

const useAuth = vi.fn()
const navigate = vi.fn()

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))
vi.mock('@/features/auth', () => ({
  SignUpForm: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={() => void onSuccess()}>trigger sign-up success</button>
  ),
}))
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

function renderSignUpPage() {
  return render(
    <MemoryRouter initialEntries={['/sign-up']}>
      <SignUpPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.mockReset()
  navigate.mockReset()
})

// Regression coverage for a real race: this page used to navigate to
// /account immediately once its own signUpWithEmail() call resolved,
// independently of AuthProvider's separate onAuthStateChanged-driven status
// resolution. When AuthProvider took a bit longer (e.g. because it now also
// guarantees the canonical profile exists), arriving at /account before
// AuthProvider caught up made RequireAuth's own status check see
// "unauthenticated" and bounce straight back to /sign-in — even though
// sign-up had genuinely succeeded. Navigating only once AuthProvider itself
// reports "authenticated" closes that race by construction.
describe('SignUpPage', () => {
  it('does not navigate while AuthProvider has not yet resolved to authenticated', () => {
    useAuth.mockReturnValue({ status: 'loading' })
    renderSignUpPage()

    fireEvent.click(screen.getByText('trigger sign-up success'))

    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates to /account once AuthProvider actually reports authenticated', () => {
    useAuth.mockReturnValue({ status: 'loading' })
    const { rerender } = renderSignUpPage()

    fireEvent.click(screen.getByText('trigger sign-up success'))
    expect(navigate).not.toHaveBeenCalled()

    useAuth.mockReturnValue({ status: 'authenticated' })
    rerender(
      <MemoryRouter initialEntries={['/sign-up']}>
        <SignUpPage />
      </MemoryRouter>,
    )

    expect(navigate).toHaveBeenCalledWith('/account')
  })

  it('does not navigate merely because AuthProvider is already authenticated without a submission', () => {
    useAuth.mockReturnValue({ status: 'authenticated' })
    renderSignUpPage()

    expect(navigate).not.toHaveBeenCalled()
  })
})

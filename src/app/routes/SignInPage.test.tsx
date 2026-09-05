import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'

const useAuth = vi.fn()
const navigate = vi.fn()

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))
vi.mock('@/features/auth', () => ({
  SignInForm: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={() => void onSuccess()}>trigger sign-in success</button>
  ),
}))
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

function renderSignInPage() {
  return render(
    <MemoryRouter initialEntries={['/sign-in']}>
      <SignInPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.mockReset()
  navigate.mockReset()
})

// Regression coverage for a real race: this page used to navigate to its
// destination immediately once its own signInWithEmail() call resolved,
// independently of AuthProvider's separate onAuthStateChanged-driven status
// resolution — arriving there before AuthProvider caught up made
// RequireAuth's own status check see "unauthenticated" and bounce straight
// back to /sign-in even though sign-in had genuinely succeeded. Navigating
// only once AuthProvider itself reports "authenticated" closes that race.
describe('SignInPage', () => {
  it('does not navigate while AuthProvider has not yet resolved to authenticated', () => {
    useAuth.mockReturnValue({ status: 'loading' })
    renderSignInPage()

    fireEvent.click(screen.getByText('trigger sign-in success'))

    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates to /account once AuthProvider actually reports authenticated', () => {
    useAuth.mockReturnValue({ status: 'loading' })
    const { rerender } = renderSignInPage()

    fireEvent.click(screen.getByText('trigger sign-in success'))
    expect(navigate).not.toHaveBeenCalled()

    useAuth.mockReturnValue({ status: 'authenticated' })
    rerender(
      <MemoryRouter initialEntries={['/sign-in']}>
        <SignInPage />
      </MemoryRouter>,
    )

    expect(navigate).toHaveBeenCalledWith('/account', { replace: true })
  })

  it('does not navigate merely because AuthProvider is already authenticated without a submission', () => {
    useAuth.mockReturnValue({ status: 'authenticated' })
    renderSignInPage()

    expect(navigate).not.toHaveBeenCalled()
  })
})

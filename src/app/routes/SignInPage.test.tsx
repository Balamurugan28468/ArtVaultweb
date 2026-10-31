import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignInPage } from './SignInPage'

const useAuth = vi.fn()
const navigate = vi.fn()
const signInProps = vi.fn()

vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))
vi.mock('@/features/auth', () => ({
  SignInForm: (props: { onSuccess: () => void }) => {
    signInProps(props)
    return <button onClick={() => void props.onSuccess()}>trigger sign-in success</button>
  },
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

it('preserves the checkout destination when switching to registration', () => {
  useAuth.mockReturnValue({ status: 'unauthenticated' })
  function Destination() { return <p>{useLocation().state.from}</p> }
  render(<MemoryRouter initialEntries={[{ pathname: '/sign-in', state: { from: '/checkout?step=address#shipping' } }]}>
    <Routes><Route path="/sign-in" element={<SignInPage />} /><Route path="/sign-up" element={<Destination />} /></Routes>
  </MemoryRouter>)
  fireEvent.click(screen.getByRole('link', { name: 'Sign up' }))
  expect(screen.getByText('/checkout?step=address#shipping')).toBeInTheDocument()
})

it('displays success banner when navigating with verified state', () => {
  useAuth.mockReturnValue({ status: 'unauthenticated' })
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/sign-in', state: { verified: true, email: 'alice@example.com' } },
      ]}
    >
      <SignInPage />
    </MemoryRouter>,
  )

  expect(
    screen.getByText('Email verified successfully. Please sign in.'),
  ).toBeInTheDocument()
})

it('never forwards credentials from route state or query parameters to the sign-in form', () => {
  useAuth.mockReturnValue({ status: 'unauthenticated' })
  render(<MemoryRouter initialEntries={[{ pathname: '/sign-in', search: '?email=query@example.com&password=ignored', state: { verified: true, email: 'state@example.com', password: 'ignored' } }]}><SignInPage /></MemoryRouter>)
  expect(Object.keys(signInProps.mock.lastCall![0])).toEqual(['onSuccess'])
})

it('shows account completion success without passing credentials into login', () => {
  useAuth.mockReturnValue({ status: 'unauthenticated' })
  render(<MemoryRouter initialEntries={[{ pathname: '/sign-in', state: { accountCreated: true } }]}><SignInPage /></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('Account created successfully. Please sign in.')
  expect(Object.keys(signInProps.mock.lastCall![0])).toEqual(['onSuccess'])
})

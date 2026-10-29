import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './VerifyEmailPage'

const navigate = vi.fn()

vi.mock('@/features/auth', () => ({
  VerifyOtpForm: ({
    initialEmail,
    onSuccess,
  }: {
    initialEmail?: string
    onSuccess: (data: { email: string }) => void
  }) => (
    <div>
      <span data-testid="initial-email">{initialEmail}</span>
      <button
        onClick={() =>
          void onSuccess({ email: initialEmail || 'verified@example.com' })
        }
      >
        trigger otp verify success
      </button>
    </div>
  ),
}))

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return { ...actual, useNavigate: () => navigate }
})

beforeEach(() => {
  navigate.mockReset()
})

describe('VerifyEmailPage', () => {
  it('reads email and from path from location state and renders heading', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/verify-email',
            state: { email: 'alice@example.com', from: '/checkout' },
          },
        ]}
      >
        <VerifyEmailPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /verify your email/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('initial-email')).toHaveTextContent(
      'alice@example.com',
    )
  })

  it('navigates to /sign-in with verified state on success', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/verify-email',
            state: { email: 'alice@example.com', from: '/checkout' },
          },
        ]}
      >
        <VerifyEmailPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('trigger otp verify success'))

    expect(navigate).toHaveBeenCalledWith('/sign-in', {
      replace: true,
      state: {
        verified: true,
        from: '/checkout',
      },
    })
  })
})


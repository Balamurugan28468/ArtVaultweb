import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignUpPage } from './SignUpPage'

const navigate = vi.fn()

vi.mock('@/features/auth', () => ({
  SignUpForm: ({
    onSuccess,
  }: {
    onSuccess: () => void
  }) => (
    <button
      onClick={() => void onSuccess()}
    >
      trigger sign-up success
    </button>
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
  navigate.mockReset()
})

describe('SignUpPage', () => {
  it('redirects only after the form reports final account completion', () => {
    renderSignUpPage()

    fireEvent.click(screen.getByText('trigger sign-up success'))

    expect(navigate).toHaveBeenCalledWith('/sign-in', {
      replace: true,
      state: {
        accountCreated: true,
        from: '/account',
      },
    })
  })

  it('preserves return destination after OTP without transferring credentials', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/sign-up',
            state: { from: '/checkout?step=address#shipping' },
          },
        ]}
      >
        <SignUpPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('trigger sign-up success'))

expect(navigate).toHaveBeenCalledWith('/sign-in', {
      replace: true,
      state: {
        accountCreated: true,
        from: '/checkout?step=address#shipping',
      },
    })
  })
})

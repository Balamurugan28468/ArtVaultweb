import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyOtpForm } from './VerifyOtpForm'

const verifyEmailOtp = vi.fn()
const resendVerificationOtp = vi.fn()

vi.mock('../api/authClient', () => ({
  signOutRegistrationSession: vi.fn().mockResolvedValue(undefined),
  verifyEmailOtp: (...args: unknown[]) => verifyEmailOtp(...args),
  resendVerificationOtp: (...args: unknown[]) => resendVerificationOtp(...args),
}))

beforeEach(() => {
  verifyEmailOtp.mockReset()
  resendVerificationOtp.mockReset()
})

function renderVerifyOtpForm(props?: {
  initialEmail?: string
  onSuccess?: () => void
}) {
  const onSuccess = props?.onSuccess || vi.fn()
  return {
    ...render(
      <MemoryRouter>
        <VerifyOtpForm
          initialEmail={props?.initialEmail ?? 'user@example.com'}
          onSuccess={onSuccess}
        />
      </MemoryRouter>,
    ),
    onSuccess,
  }
}

describe('VerifyOtpForm', () => {
  it('renders initial email and 6 digit inputs', () => {
    renderVerifyOtpForm({ initialEmail: 'alice@example.com' })

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    const digitInputs = screen.getAllByRole('textbox')
    expect(digitInputs).toHaveLength(6)
  })

  it('renders an email input if no initialEmail is provided', () => {
    render(
      <MemoryRouter>
        <VerifyOtpForm initialEmail="" onSuccess={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/registration email/i)).toBeInTheDocument()
  })

  it('allows entering digits and disables submit button until 6 digits are typed', () => {
    renderVerifyOtpForm()

    const submitBtn = screen.getByRole('button', { name: /verify otp/i })
    expect(submitBtn).toBeDisabled()

    const digitInputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 5; i++) {
      fireEvent.change(digitInputs[i], { target: { value: String(i + 1) } })
    }
    expect(submitBtn).toBeDisabled()

    fireEvent.change(digitInputs[5], { target: { value: '6' } })
    expect(submitBtn).not.toBeDisabled()
  })

  it('handles pasting a 6-digit code across the input boxes', () => {
    renderVerifyOtpForm()

    const firstInput = screen.getByLabelText('Digit 1 of 6')
    fireEvent.paste(firstInput, {
      clipboardData: {
        getData: () => '654321',
      },
    })

    const digitInputs = screen.getAllByRole('textbox')
    expect(digitInputs[0]).toHaveValue('6')
    expect(digitInputs[1]).toHaveValue('5')
    expect(digitInputs[2]).toHaveValue('4')
    expect(digitInputs[3]).toHaveValue('3')
    expect(digitInputs[4]).toHaveValue('2')
    expect(digitInputs[5]).toHaveValue('1')

    const submitBtn = screen.getByRole('button', { name: /verify otp/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('calls verifyEmailOtp and onSuccess on submission', async () => {
    verifyEmailOtp.mockResolvedValueOnce({
      user: { id: 'alice', email: 'alice@example.com' },
    })
    const { onSuccess } = renderVerifyOtpForm({ initialEmail: 'alice@example.com' })

    const firstInput = screen.getByLabelText('Digit 1 of 6')
    fireEvent.paste(firstInput, {
      clipboardData: {
        getData: () => '123456',
      },
    })

    const submitBtn = screen.getByRole('button', { name: /verify otp/i })
    fireEvent.click(submitBtn)

    await waitFor(() =>
      expect(verifyEmailOtp).toHaveBeenCalledWith({
        email: 'alice@example.com',
        token: '123456',
      }),
    )
    expect(onSuccess).toHaveBeenCalledWith({ email: 'alice@example.com' })
  })

  it('displays error message when verification fails', async () => {
    verifyEmailOtp.mockRejectedValueOnce(
      new Error('The verification code is incorrect.'),
    )
    renderVerifyOtpForm()

    const firstInput = screen.getByLabelText('Digit 1 of 6')
    fireEvent.paste(firstInput, {
      clipboardData: {
        getData: () => '000000',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /verify otp/i }))

    expect(
      await screen.findByText('The verification code is incorrect.'),
    ).toBeInTheDocument()
  })

  it('disables resend button initially due to cooldown', () => {
    renderVerifyOtpForm()

    const resendBtn = screen.getByRole('button', { name: /resend otp/i })
    expect(resendBtn).toBeDisabled()
    expect(resendBtn).toHaveTextContent(/resend otp in/i)
  })

  it('renders a link back to registration', () => {
    renderVerifyOtpForm()

    const link = screen.getByRole('link', { name: /back to registration/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/sign-up')
  })
})


it('supports autofocus, numeric-only input, auto advance, backspace and arrows', () => {
  renderVerifyOtpForm()
  const inputs = screen.getAllByRole('textbox')
  expect(inputs[0]).toHaveFocus()
  fireEvent.change(inputs[0], { target: { value: 'x' } })
  expect(inputs[0]).toHaveValue('')
  fireEvent.change(inputs[0], { target: { value: '1' } })
  expect(inputs[1]).toHaveFocus()
  fireEvent.keyDown(inputs[1], { key: 'Backspace' })
  expect(inputs[0]).toHaveFocus()
  fireEvent.keyDown(inputs[0], { key: 'ArrowRight' })
  expect(inputs[1]).toHaveFocus()
  fireEvent.keyDown(inputs[1], { key: 'ArrowLeft' })
  expect(inputs[0]).toHaveFocus()
})
it('resends only after cooldown and starts a fresh cooldown', async () => {
  vi.useFakeTimers()
  try {
    resendVerificationOtp.mockResolvedValueOnce(undefined)
    renderVerifyOtpForm()
    await act(async () => { vi.advanceTimersByTime(60000) })
    const button = screen.getByRole('button', { name: 'Resend OTP' })
    expect(button).toBeEnabled()
    fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
    await act(async () => { fireEvent.click(button) })
    expect(resendVerificationOtp).toHaveBeenCalledWith('user@example.com')
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('')
    expect(screen.getByRole('button', { name: /Resend OTP in 60s/ })).toBeDisabled()
  } finally { vi.useRealTimers() }
})
it('keeps the user on the OTP step when the code expires', async () => {
  verifyEmailOtp.mockRejectedValueOnce(new Error('This verification code has expired. Request a new code.'))
  const { onSuccess } = renderVerifyOtpForm()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('expired')
  expect(onSuccess).not.toHaveBeenCalled()
})

it('rejects an eight-digit paste instead of verifying a truncated six-digit code', () => {
  renderVerifyOtpForm()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '12345678' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Longer codes cannot be truncated.')
  for (let i = 1; i <= 6; i++) expect(screen.getByLabelText(`Digit ${i} of 6`)).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  expect(verifyEmailOtp).not.toHaveBeenCalled()
})

it('does not allow a second verification or resend after successful verification', async () => {
  verifyEmailOtp.mockResolvedValueOnce({ user: { id: 'alice' } })
  const { onSuccess } = renderVerifyOtpForm()
  fireEvent.paste(screen.getByLabelText('Digit 1 of 6'), { clipboardData: { getData: () => '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }))
  expect(verifyEmailOtp).toHaveBeenCalledTimes(1)
})

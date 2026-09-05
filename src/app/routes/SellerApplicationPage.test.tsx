import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SellerApplicationPage } from './SellerApplicationPage'

const useSellerStatus = vi.fn()
vi.mock('@/features/seller-studio', () => ({
  useSellerStatus: () => useSellerStatus(),
  SellerApplicationForm: () => <form aria-label="seller application form" />,
  SellerStatusCard: ({ application }: { application: { status: string } }) => (
    <div data-testid="seller-status-card">{application.status}</div>
  ),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/seller/apply']}>
      <Routes>
        <Route path="/seller/apply" element={<SellerApplicationPage />} />
        <Route path="/seller-studio" element={<p>Seller Studio page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

// Regression coverage: an already-approved seller navigating directly to
// /seller/apply (e.g. an old bookmark, or the pre-approval "Become a
// seller" link cached somewhere) must never see a fresh application form,
// or even the application-flavored status page — they're redirected
// straight to Seller Studio, since there's nothing left to apply for.
describe('SellerApplicationPage', () => {
  it('shows the application form for a customer who has never applied', () => {
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderPage()

    expect(screen.getByLabelText('seller application form')).toBeInTheDocument()
    expect(screen.queryByTestId('seller-status-card')).not.toBeInTheDocument()
  })

  it('shows the status card, not a form, while an application is pending', () => {
    useSellerStatus.mockReturnValue({ status: 'pending', application: { status: 'PENDING' } })
    renderPage()

    expect(screen.queryByLabelText('seller application form')).not.toBeInTheDocument()
    expect(screen.getByTestId('seller-status-card')).toHaveTextContent('PENDING')
  })

  it('redirects an already-approved seller straight to Seller Studio — never a form, never a status page', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { status: 'APPROVED' } })
    renderPage()

    expect(screen.getByText('Seller Studio page')).toBeInTheDocument()
    expect(screen.queryByLabelText('seller application form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('seller-status-card')).not.toBeInTheDocument()
  })
})

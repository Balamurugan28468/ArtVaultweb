import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AccountReviewsPage } from './AccountReviewsPage'

const fetchUserReviews = vi.fn()
vi.mock('@/features/reviews', () => ({
  fetchUserReviews: () => fetchUserReviews(),
  deleteArtworkReview: vi.fn(),
  updateArtworkReview: vi.fn(),
  StarRating: ({ value }: { value: number }) => <div>Rating: {value}</div>,
  ArtworkReviewForm: () => <div>Edit Form</div>,
}))

describe('AccountReviewsPage', () => {
  it('renders reviews management dashboard', async () => {
    fetchUserReviews.mockResolvedValueOnce([
      {
        id: 'rev-1',
        artworkId: 'art-1',
        buyerId: 'u1',
        rating: 5,
        title: 'Exceptional Texture',
        content: 'The piece exceeded expectations.',
        buyerName: 'Alice',
        createdAt: { toDate: () => new Date(), toMillis: () => Date.now(), isEqual: () => false },
        updatedAt: { toDate: () => new Date(), toMillis: () => Date.now(), isEqual: () => false },
      },
    ])

    render(
      <MemoryRouter>
        <AccountReviewsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('My Reviews')).toBeInTheDocument()
    expect(await screen.findByText('Exceptional Texture')).toBeInTheDocument()
    expect(screen.getByText('The piece exceeded expectations.')).toBeInTheDocument()
  })
})

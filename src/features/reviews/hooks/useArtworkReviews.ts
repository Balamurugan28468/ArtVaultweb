import { useCallback, useEffect, useState } from 'react'
import {
  checkReviewEligibility,
  fetchArtworkRatingSummary,
  fetchArtworkReviews,
} from '../api/reviewRepository'
import type { ArtworkRatingSummary, ArtworkReview, ReviewEligibility } from '../types'

export function useArtworkReviews(artworkId: string | undefined, sellerId?: string) {
  const [reviews, setReviews] = useState<ArtworkReview[]>([])
  const [summary, setSummary] = useState<ArtworkRatingSummary>({
    averageRating: 0,
    reviewCount: 0,
    ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  })
  const [eligibility, setEligibility] = useState<ReviewEligibility>({ eligible: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadData = useCallback(async () => {
    if (!artworkId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [revs, summ, elig] = await Promise.all([
        fetchArtworkReviews(artworkId).catch(() => []),
        fetchArtworkRatingSummary(artworkId),
        checkReviewEligibility(artworkId, sellerId),
      ])

      setReviews(revs)
      setSummary(summ)
      setEligibility(elig)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load reviews'))
    } finally {
      setLoading(false)
    }
  }, [artworkId, sellerId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return {
    reviews,
    summary,
    eligibility,
    loading,
    error,
    refresh: loadData,
  }
}


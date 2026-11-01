import type { Timestamp } from '@/lib/supabase/timestamp'

export interface ArtworkReview {
  id: string
  artworkId: string
  buyerId: string
  buyerName?: string
  rating: number
  title: string
  content: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ArtworkRatingSummary {
  averageRating: number
  reviewCount: number
  ratingCounts: {
    1: number
    2: number
    3: number
    4: number
    5: number
  }
}

export interface CreateReviewInput {
  artworkId: string
  rating: number
  title: string
  content: string
}

export interface UpdateReviewInput {
  rating: number
  title: string
  content: string
}

export interface ReviewEligibility {
  eligible: boolean
  reason?: 'NOT_LOGGED_IN' | 'NOT_PURCHASED' | 'ALREADY_REVIEWED' | 'SELLER_OWN_ARTWORK'
  existingReview?: ArtworkReview
}


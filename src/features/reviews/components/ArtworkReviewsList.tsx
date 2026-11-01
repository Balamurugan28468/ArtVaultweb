import { CheckCircle2, MessageSquare, Trash2, Edit3 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card } from '@/shared/ui'
import { useOptionalAuth } from '@/app/providers/AuthProvider'
import { deleteArtworkReview } from '../api/reviewRepository'
import type { ArtworkRatingSummary, ArtworkReview, ReviewEligibility } from '../types'
import { ArtworkReviewForm } from './ArtworkReviewForm'
import { StarRating } from './StarRating'

interface ArtworkReviewsListProps {
  artworkId: string
  reviews: ArtworkReview[]
  summary: ArtworkRatingSummary
  eligibility: ReviewEligibility
  onRefresh: () => void
}

export function ArtworkReviewsList({
  artworkId,
  reviews,
  summary,
  eligibility,
  onRefresh,
}: ArtworkReviewsListProps) {
  const auth = useOptionalAuth()
  const user = auth?.user ?? null
  const [isWriting, setIsWriting] = useState(false)
  const [editingReview, setEditingReview] = useState<ArtworkReview | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete your review?')) return
    setDeletingId(id)
    try {
      await deleteArtworkReview(id)
      onRefresh()
    } finally {
      setDeletingId(null)
    }
  }

  const { averageRating, reviewCount, ratingCounts } = summary

  return (
    <div className="flex flex-col gap-6">
      {/* Top summary section */}
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center justify-center rounded-xl bg-surface-elevated p-4 text-center">
            <span className="font-display text-4xl font-semibold text-accent-gold">
              {reviewCount > 0 ? averageRating.toFixed(1) : '—'}
            </span>
            <StarRating value={Math.round(averageRating)} readOnly size="sm" />
            <span className="mt-1 text-xs text-text-muted">
              {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          {/* Breakdown bars */}
          <div className="flex flex-1 flex-col gap-1.5 min-w-[12rem]">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = ratingCounts[stars as keyof typeof ratingCounts] || 0
              const percent = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-text-secondary">{stars}★</span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface-elevated overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-gold transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-7 text-right text-text-muted">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action button / eligibility explanation */}
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {eligibility.eligible && !isWriting && !editingReview && (
            <Button variant="gold" size="sm" onClick={() => setIsWriting(true)}>
              Write a Review
            </Button>
          )}

          {!eligibility.eligible && eligibility.reason === 'ALREADY_REVIEWED' && !editingReview && (
            <div className="flex items-center gap-1.5 text-xs text-accent-gold">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              <span>You have already reviewed this artwork.</span>
            </div>
          )}

          {!eligibility.eligible && eligibility.reason === 'NOT_PURCHASED' && (
            <p className="max-w-xs text-xs text-text-muted text-left sm:text-right">
              Only verified collectors who have purchased this artwork can write a review.
            </p>
          )}

          {!eligibility.eligible && eligibility.reason === 'SELLER_OWN_ARTWORK' && (
            <p className="text-xs text-text-muted">
              Artists cannot review their own artwork.
            </p>
          )}

          {!eligibility.eligible && eligibility.reason === 'NOT_LOGGED_IN' && (
            <p className="text-xs text-text-muted">
              Sign in with your collector account to review your purchases.
            </p>
          )}
        </div>
      </Card>

      {/* Review Form */}
      {(isWriting || editingReview) && (
        <ArtworkReviewForm
          artworkId={artworkId}
          existingReview={editingReview || undefined}
          onSuccess={() => {
            setIsWriting(false)
            setEditingReview(null)
            onRefresh()
          }}
          onCancel={() => {
            setIsWriting(false)
            setEditingReview(null)
          }}
        />
      )}

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
          <MessageSquare aria-hidden="true" className="h-8 w-8 text-text-muted/60" />
          <h4 className="mt-2 text-sm font-medium text-text-primary">No collector reviews yet</h4>
          <p className="mt-1 max-w-sm text-xs text-text-secondary">
            Be the first collector to share your impressions of this piece once acquired.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((rev) => {
            const isOwn = user?.id === rev.buyerId
            return (
              <Card key={rev.id} className="flex flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <StarRating value={rev.rating} readOnly size="sm" />
                      <span className="font-medium text-sm text-text-primary">{rev.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>{rev.buyerName || 'Verified Collector'}</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                        Verified Purchase
                      </span>
                      <span>•</span>
                      <span>{rev.createdAt.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>

                  {isOwn && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingReview(rev)}
                        className="rounded p-1 text-text-muted hover:text-text-primary"
                        title="Edit review"
                        aria-label="Edit review"
                      >
                        <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rev.id)}
                        disabled={deletingId === rev.id}
                        className="rounded p-1 text-text-muted hover:text-danger"
                        title="Delete review"
                        aria-label="Delete review"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm text-text-secondary">{rev.content}</p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}


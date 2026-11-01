import { useState } from 'react'
import { Button } from '@/shared/ui'
import { createArtworkReview, updateArtworkReview } from '../api/reviewRepository'
import type { ArtworkReview } from '../types'
import { StarRating } from './StarRating'

interface ArtworkReviewFormProps {
  artworkId: string
  existingReview?: ArtworkReview
  onSuccess: () => void
  onCancel?: () => void
}

export function ArtworkReviewForm({
  artworkId,
  existingReview,
  onSuccess,
  onCancel,
}: ArtworkReviewFormProps) {
  const [rating, setRating] = useState(existingReview?.rating ?? 5)
  const [title, setTitle] = useState(existingReview?.title ?? '')
  const [content, setContent] = useState(existingReview?.content ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Please provide a review headline.')
      return
    }
    if (!content.trim()) {
      setError('Please write your review feedback.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (existingReview) {
        await updateArtworkReview(existingReview.id, {
          rating,
          title: title.trim(),
          content: content.trim(),
        })
      } else {
        await createArtworkReview({
          artworkId,
          rating,
          title: title.trim(),
          content: content.trim(),
        })
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card">
      <h3 className="font-display text-base font-medium text-text-primary">
        {existingReview ? 'Edit Your Review' : 'Write a Verified Collector Review'}
      </h3>

      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-text-secondary">Your Rating</label>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-title" className="text-xs font-medium text-text-secondary">
          Review Headline
        </label>
        <input
          id="review-title"
          type="text"
          maxLength={120}
          required
          placeholder="Summarize your experience (e.g. Stunning texture and colors!)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-content" className="text-xs font-medium text-text-secondary">
          Detailed Review
        </label>
        <textarea
          id="review-content"
          rows={4}
          maxLength={2000}
          required
          placeholder="Tell other collectors about the framing, packaging, authenticity, or how it looks in your space..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
        />
        <span className="text-right text-xs text-text-muted">{content.length} / 2000</span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="gold" size="sm" disabled={submitting}>
          {submitting ? 'Submitting…' : existingReview ? 'Update Review' : 'Submit Review'}
        </Button>
      </div>
    </form>
  )
}


import { Edit3, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArtworkReviewForm,
  deleteArtworkReview,
  fetchUserReviews,
  StarRating,
  type ArtworkReview,
} from '@/features/reviews'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/shared/ui'

export function AccountReviewsPage() {
  const [reviews, setReviews] = useState<(ArtworkReview & { artworkTitle?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [editingReview, setEditingReview] = useState<ArtworkReview | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await fetchUserReviews()
      setReviews(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this review?')) return
    setDeletingId(id)
    try {
      await deleteArtworkReview(id)
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/account" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Account
        </Link>
        <PageHeader
          title="My Reviews"
          description="Manage feedback and collector ratings you have shared for acquired artworks."
        />
      </div>

      {editingReview && (
        <ArtworkReviewForm
          artworkId={editingReview.artworkId}
          existingReview={editingReview}
          onSuccess={() => {
            setEditingReview(null)
            void load()
          }}
          onCancel={() => setEditingReview(null)}
        />
      )}

      {loading && reviews.length === 0 && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <Card key={i} className="flex flex-col gap-3 p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full" />
            </Card>
          ))}
        </div>
      )}

      {!loading && reviews.length === 0 && !editingReview && (
        <EmptyState
          title="No reviews submitted yet"
          description="When you acquire artworks from verified artists, you can leave ratings and impressions here."
          action={
            <Link to="/explore" className="rounded-lg bg-accent-gold px-4 py-2 text-xs font-medium text-black">
              Explore Artworks
            </Link>
          }
        />
      )}

      {!loading && reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviews.map((rev) => (
            <Card key={rev.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Link
                    to={`/artworks/${rev.artworkId}`}
                    className="font-display text-base font-medium text-text-primary hover:text-accent-gold hover:underline"
                  >
                    {rev.artworkTitle || 'Artwork Review'}
                  </Link>

                  <div className="flex items-center gap-2">
                    <StarRating value={rev.rating} readOnly size="sm" />
                    <span className="text-xs font-semibold text-text-primary">{rev.title}</span>
                  </div>

                  <span className="text-[11px] text-text-muted">
                    Reviewed on {rev.createdAt.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingReview(rev)}
                    className="text-xs"
                  >
                    <Edit3 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={deletingId === rev.id}
                    onClick={() => handleDelete(rev.id)}
                    className="text-xs text-danger hover:bg-danger/10"
                  >
                    <Trash2 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm text-text-secondary leading-relaxed bg-surface-elevated/60 p-3.5 rounded-lg border border-border">
                {rev.content}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}


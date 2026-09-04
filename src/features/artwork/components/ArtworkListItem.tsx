import { Link } from 'react-router'
import { Badge, Card } from '@/shared/ui'
import type { Artwork } from '../types'

export function ArtworkListItem({ artwork }: { artwork: Artwork }) {
  const isSubmitted = artwork.status === 'SUBMITTED'

  return (
    <Link to={`/seller-studio/artworks/${artwork.id}/edit`} className="block">
      <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-brand-primary">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>
          <Badge tone={isSubmitted ? 'success' : 'neutral'}>{isSubmitted ? 'Submitted' : 'Draft'}</Badge>
        </div>
        <p className="text-sm text-text-secondary">₹{(artwork.price / 100).toFixed(0)}</p>
        <p className="text-xs text-text-muted">{artwork.inventoryCount} in stock</p>
      </Card>
    </Link>
  )
}

import { ResponsiveGrid } from '@/shared/ui'
import { ArtworkListItem } from './ArtworkListItem'
import type { Artwork } from '../types'

export function ArtworkList({ artworks }: { artworks: Artwork[] }) {
  return (
    <ResponsiveGrid>
      {artworks.map((artwork) => (
        <ArtworkListItem key={artwork.id} artwork={artwork} />
      ))}
    </ResponsiveGrid>
  )
}

import { Box, ImageOff, Sparkles, Star } from 'lucide-react'
import { type ComponentType } from 'react'
import { Link, useParams } from 'react-router'
import { usePublicArtwork } from '@/features/artwork'
import { LikeButton } from '@/features/likes'
import { WishlistButton } from '@/features/wishlist'
import { Container, EmptyState, ErrorState, ShareButton, Skeleton } from '@/shared/ui'

interface SidebarLink {
  icon: ComponentType<{ className?: string }>
  label: string
  href?: string
}

/** Artwork image and AR availability information. No viewer or device detection exists yet. */
export function ArtworkArPage() {
  const { artworkId } = useParams()
  const artworkQuery = usePublicArtwork(artworkId)
  const artwork = artworkQuery.status === 'success' ? artworkQuery.data : undefined

  const canonicalUrl = artworkId && typeof window !== 'undefined' ? `${window.location.origin}/artworks/${artworkId}` : ''

  const sidebarLinks: SidebarLink[] = artworkId
    ? [
        { icon: Sparkles, label: 'Overview', href: `/artworks/${artworkId}` },
        { icon: Box, label: 'AR unavailable' },
        { icon: Sparkles, label: 'AI Analysis', href: `/artworks/${artworkId}/analysis` },
        { icon: Star, label: 'Artist Info', href: artwork ? `/artists/${artwork.sellerId}` : undefined },
        { icon: Star, label: 'Reviews unavailable' },
      ]
    : []

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        {artworkId && (
          <Link to={`/artworks/${artworkId}`} className="text-sm text-text-secondary hover:text-text-primary hover:underline">
            ← Back to Artwork
          </Link>
        )}

        {!artworkId && <EmptyState title="Artwork not found" description="This artwork doesn't exist, or isn't available." />}

        {artworkId && artworkQuery.status === 'pending' && (
          <div aria-busy="true" aria-label="Loading artwork" className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {artworkId && artworkQuery.status === 'error' && (
          <ErrorState title="Couldn't load this artwork" description="Something went wrong. Please try again." />
        )}

        {artworkId && artworkQuery.status === 'success' && !artwork && (
          <EmptyState title="Artwork not found" description="This artwork doesn't exist, or isn't available." />
        )}

        {artwork && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:items-start">
            {/* LEFT — artwork summary */}
            <div className="flex min-w-0 flex-col gap-3">
              <div>
                <h1 className="font-display text-lg font-medium text-text-primary">{artwork.title}</h1>
              </div>

              {/* Mobile-only compact rail — real links/inert items, same set as the desktop list below, just horizontal and slim so it never pushes the image far down the page. */}
              <nav aria-label="Artwork" className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {sidebarLinks.map((link) =>
                  link.href ? (
                    <Link
                      key={link.label}
                      to={link.href}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
                    >
                      <link.icon aria-hidden="true" className="h-3.5 w-3.5" />
                      {link.label}
                    </Link>
                  ) : (
                    <span
                      key={link.label}
                      aria-current={link.label === 'AR unavailable' ? 'page' : undefined}
                      className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-400"
                    >
                      <link.icon aria-hidden="true" className="h-3.5 w-3.5" />
                      {link.label}
                    </span>
                  ),
                )}
              </nav>

              {/* Desktop-only vertical list — unchanged from the original layout. */}
              <nav aria-label="Artwork" className="hidden lg:flex lg:flex-col lg:gap-1">
                {sidebarLinks.map((link) =>
                  link.href ? (
                    <Link
                      key={link.label}
                      to={link.href}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                    >
                      <link.icon aria-hidden="true" className="h-4 w-4" />
                      {link.label}
                    </Link>
                  ) : (
                    <span key={link.label} className="flex items-center gap-2.5 rounded-md bg-blue-600/10 px-3 py-2 text-sm font-medium text-blue-400">
                      <link.icon aria-hidden="true" className="h-4 w-4" />
                      {link.label}
                    </span>
                  ),
                )}
              </nav>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <WishlistButton artworkId={artwork.id} />
                <LikeButton artworkId={artwork.id} likeCount={artwork.likeCount} />
                <ShareButton url={canonicalUrl} title={artwork.title} text={`${artwork.title} on ArtVault`} />
              </div>
            </div>

            {/* Keep the real artwork image prominent on mobile. */}
            <div className="flex flex-col gap-3">
              <div className="relative flex min-h-[20rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated sm:min-h-[26rem]">
                {artwork.images[0] ? (
                  <img src={artwork.images[0].url} alt={artwork.title} className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageOff aria-hidden="true" className="h-10 w-10 text-text-muted" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <p className="font-medium text-white">Artwork image preview</p>
                  <p className="text-sm text-white/80">This image does not show real-world scale or camera placement.</p>
                </div>
              </div>


            </div>

            <div className="flex min-w-0 flex-col gap-3">
              <h2 className="font-display text-lg font-medium text-text-primary">AR preview unavailable</h2>
              <p role="status" className="rounded-md border border-blue-600/30 bg-blue-600/10 p-3 text-sm text-text-secondary">
                Camera placement, true-scale viewing, room previews, and artwork transforms are not available yet.
                You can view the artwork image and return to its details.
              </p>
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}

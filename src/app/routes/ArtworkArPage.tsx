import { Box, ImageOff, RotateCcw, Scan, Share2, Sparkles, Star } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router'
import { usePublicArtwork } from '@/features/artwork'
import { LikeButton } from '@/features/likes'
import { WishlistButton } from '@/features/wishlist'
import { Button, Container, EmptyState, ErrorState, ShareButton, Skeleton } from '@/shared/ui'

type ArPreviewTab = 'ar' | 'room'

interface SidebarLink {
  icon: ComponentType<{ className?: string }>
  label: string
  href?: string
}

/**
 * UI-05 — AR "View in Your Space". docs/AR_ARCHITECTURE.md's own stated
 * status is "design only: no AR viewer, asset pipeline, or <ViewInAR>
 * component exists yet" — no real device capability check is performed
 * here, deliberately: even a WebXR-capable device cannot get real AR from
 * this app today (no `<model-viewer>` is loaded, no GLB asset pipeline
 * exists), so claiming to "detect support" would itself be dishonest.
 * Every control (Start AR Preview, Try a Sample Room, Rotate/Resize/
 * Reset) is a real, clearly-disabled button with an honest explanation —
 * never a fabricated camera feed or working transform.
 *
 * Mobile correction pass: the full vertical navigation list (Overview/
 * View in AR/AI Analysis/Artist Info/Reviews) is `hidden` below `lg` and
 * replaced by a compact horizontal rail right under the title, so the
 * real artwork preview appears near the top of the page instead of below
 * five stacked nav rows. Desktop keeps the exact same left-column list,
 * unchanged. The AR View/Room Preview tabs were also moved to sit
 * directly under the image (both breakpoints) rather than in a separate
 * "third column" that would land after the image in mobile DOM order.
 */
export function ArtworkArPage() {
  const { artworkId } = useParams()
  const artworkQuery = usePublicArtwork(artworkId)
  const artwork = artworkQuery.status === 'success' ? artworkQuery.data : undefined
  const [activeTab, setActiveTab] = useState<ArPreviewTab>('ar')

  const canonicalUrl = artworkId && typeof window !== 'undefined' ? `${window.location.origin}/artworks/${artworkId}` : ''

  const sidebarLinks: SidebarLink[] = artworkId
    ? [
        { icon: Sparkles, label: 'Overview', href: `/artworks/${artworkId}` },
        { icon: Box, label: 'View in AR' },
        { icon: Sparkles, label: 'AI Analysis', href: `/artworks/${artworkId}/analysis` },
        { icon: Star, label: 'Artist Info' },
        { icon: Star, label: 'Reviews' },
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
          <div aria-busy="true" aria-label="Loading artwork" className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
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
            <div className="flex flex-col gap-3">
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
                      aria-disabled="true"
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

            {/* CENTER — preview, then the AR View/Room Preview tabs, then controls — kept together so mobile DOM order matches the required "preview → tabs → controls" sequence without needing CSS reordering. */}
            <div className="flex flex-col gap-3">
              <div className="relative flex min-h-[20rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated sm:min-h-[26rem]">
                {artwork.images[0] ? (
                  <img src={artwork.images[0].url} alt={artwork.title} className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageOff aria-hidden="true" className="h-10 w-10 text-text-muted" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <p className="font-medium text-white">See how it looks in your space</p>
                  <p className="text-sm text-white/80">Use AR to visualize this artwork on your wall in real size.</p>
                </div>
              </div>

              <div role="tablist" aria-label="Preview mode" className="flex gap-1 rounded-lg border border-border bg-surface p-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ar'}
                  onClick={() => setActiveTab('ar')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-standard ${
                    activeTab === 'ar' ? 'bg-blue-600 text-white' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Box aria-hidden="true" className="h-4 w-4" /> AR View
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'room'}
                  onClick={() => setActiveTab('room')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-standard ${
                    activeTab === 'room' ? 'bg-blue-600 text-white' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Room Preview
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled title="AR preview isn't connected yet">
                  <RotateCcw aria-hidden="true" className="h-4 w-4" /> Rotate
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled title="AR preview isn't connected yet">
                  <Scan aria-hidden="true" className="h-4 w-4" /> Resize
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled title="AR preview isn't connected yet">
                  Reset
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled title="AR preview isn't connected yet">
                  <Share2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* RIGHT — instructions + CTAs + honest fallback note */}
            <div className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3">
                {[
                  { step: 1, title: 'Point your camera', description: 'Allow camera access to start AR.' },
                  { step: 2, title: 'Place the artwork', description: 'Move and rotate to find the best spot.' },
                  { step: 3, title: 'See it in your space', description: 'Experience true-to-life size and detail.' },
                ].map(({ step, title, description }) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-medium text-text-primary">
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{title}</p>
                      <p className="text-xs text-text-secondary">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <Button type="button" variant="gold" disabled title="AR preview isn't connected yet">
                <Box aria-hidden="true" className="h-4 w-4" /> Start AR Preview
              </Button>
              <p className="text-center text-xs text-text-muted">or</p>
              <Button type="button" variant="secondary" disabled title="AR preview isn't connected yet">
                Try a Sample Room
              </Button>

              <p role="status" className="rounded-md border border-blue-600/30 bg-blue-600/10 p-3 text-xs text-text-secondary">
                AR preview isn't connected yet — no AR viewer or asset pipeline exists in ArtVault today (see the
                project's AR architecture docs). AR generally works best on supported mobile devices; if it's ever
                unavailable on yours, a sample room preview will still be offered instead.
              </p>
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}

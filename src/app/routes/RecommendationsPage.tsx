import { Heart, Sparkles, TrendingUp, Users } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { PublicArtworkCard } from '@/features/artwork'
import { useArtistDisplayNames } from '@/features/marketplace'
import { useForYouArtworks, useSimilarArtworks, useTrendingArtworks } from '@/features/recommendations'
import { Card, Container, EmptyState, ErrorState, PageHeader, ResponsiveGrid, Skeleton } from '@/shared/ui'

type RecommendationTab = 'for-you' | 'similar' | 'trending' | 'following' | 'liked'
const TABS: { id: RecommendationTab; label: string }[] = [
  { id: 'for-you', label: 'For You' },
  { id: 'similar', label: 'Similar Artworks' },
  { id: 'trending', label: 'Trending Now' },
  { id: 'following', label: 'Artists You Follow' },
  { id: 'liked', label: 'Based on Your Likes' },
]

/**
 * UI-05 — Personalized Recommendations. No AI recommendation engine
 * exists anywhere in this codebase (see docs/AI_ARCHITECTURE.md), so
 * nothing here is ever labeled "AI personalized." Real signals only:
 * - For You / Similar Artworks: derived from the viewer's real Wishlist
 *   (see useForYouArtworks/useSimilarArtworks) — plain category-matching,
 *   never a ranking model.
 * - Trending Now: the real `likeCount` field, sorted — always available,
 *   no sign-in required.
 * - Artists You Follow: honestly unavailable — "Follows" was explicitly
 *   deferred and was never built (see ARTVAULT_PROJECT_STATE.md).
 * - Based on Your Likes: honestly unavailable — `likes/{artworkId}/by/
 *   {uid}` is a write-locked increment mechanism (firestore.rules denies
 *   listing it), so "which artworks has this viewer liked" isn't a query
 *   this app can safely answer today without a new, broader read
 *   capability — out of scope for a UI-only pass.
 */
export function RecommendationsPage() {
  const [activeTab, setActiveTab] = useState<RecommendationTab>('for-you')
  const forYou = useForYouArtworks()
  const similar = useSimilarArtworks()
  const trending = useTrendingArtworks()

  const activeArtworks =
    activeTab === 'for-you' ? forYou.artworks : activeTab === 'similar' ? similar.artworks : activeTab === 'trending' ? trending.data ?? [] : []
  const artistNames = useArtistDisplayNames(activeArtworks.map((artwork) => artwork.sellerId))

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        <PageHeader title="Recommended for You" description="Discover artworks based on your interests and activity." />

        <div role="tablist" aria-label="Recommendation source" className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-standard ${
                activeTab === tab.id
                  ? 'border-accent-gold bg-accent-gold/10 text-accent-gold'
                  : 'border-border-strong text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'for-you' && (
          <RecommendationGrid
            status={forYou.status}
            artworks={forYou.artworks}
            artistNames={artistNames}
            emptyTitle="Nothing to recommend yet"
            emptyDescription="Save an artwork to your Wishlist and real picks based on it will appear here."
          />
        )}

        {activeTab === 'similar' && (
          <RecommendationGrid
            status={similar.status}
            artworks={similar.artworks}
            artistNames={artistNames}
            emptyTitle="No similar artworks yet"
            emptyDescription="Save an artwork to your Wishlist — similar pieces in the same category will show up here."
          />
        )}

        {activeTab === 'trending' && (
          <RecommendationGrid
            status={trending.status === 'pending' ? 'loading' : trending.status === 'error' ? 'error' : 'success'}
            artworks={trending.data ?? []}
            artistNames={artistNames}
            emptyTitle="No trending artworks yet"
            emptyDescription="The most-liked artworks on ArtVault will show up here."
          />
        )}

        {activeTab === 'following' && (
          <UnavailableTab
            icon={Users}
            title="Following artists isn't available yet"
            description="ArtVault doesn't support following artists today — this tab will show new work from artists you follow once that feature exists."
          />
        )}

        {activeTab === 'liked' && (
          <UnavailableTab
            icon={Heart}
            title="Picks based on your Likes aren't available yet"
            description="ArtVault can't yet look up which artworks you've liked to build this list. In the meantime, try Trending Now or save artworks to your Wishlist for For You picks."
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InfoCard icon={Heart} title="Based on Your Interests" description="Recommended using your liked artworks and Wishlist activity." />
          <InfoCard icon={Sparkles} title="Similar to Your Favorites" description="Discover artworks similar to pieces you've saved." />
          <InfoCard icon={TrendingUp} title="Trending on ArtVault" description="Recommendations based on your ArtVault activity — never AI-generated." />
        </div>
      </section>
    </Container>
  )
}

function RecommendationGrid({
  status,
  artworks,
  artistNames,
  emptyTitle,
  emptyDescription,
}: {
  status: 'loading' | 'success' | 'error'
  artworks: ReturnType<typeof useForYouArtworks>['artworks']
  artistNames: Record<string, string | null>
  emptyTitle: string
  emptyDescription: string
}) {
  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading recommendations" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="hidden aspect-[4/5] w-full md:block" />
        <Skeleton className="hidden aspect-[4/5] w-full xl:block" />
      </div>
    )
  }

  if (status === 'error') {
    return <ErrorState title="Couldn't load recommendations" description="Something went wrong. Please try again." />
  }

  if (artworks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <ResponsiveGrid>
      {artworks.map((artwork) => (
        <PublicArtworkCard key={artwork.id} artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
      ))}
    </ResponsiveGrid>
  )
}

function UnavailableTab({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
      <Icon aria-hidden="true" className="h-6 w-6 text-text-muted" />
      <p className="text-base font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-sm text-text-secondary">{description}</p>
    </div>
  )
}

function InfoCard({ icon: Icon, title, description }: { icon: ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary-on-dark">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
    </Card>
  )
}

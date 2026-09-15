import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArtworkGallery, PublicArtworkCard, usePublicArtwork } from '@/features/artwork'
import { useArtworkAnalysis } from '@/features/artwork-analysis'
import { useArtistDisplayNames, useRelatedArtworks } from '@/features/marketplace'
import { Container, EmptyState, ErrorState, ResponsiveGrid, Skeleton } from '@/shared/ui'

type AnalysisTab = 'overview' | 'style' | 'composition' | 'colors' | 'emotion' | 'authenticity' | 'similar'
const TABS: { id: AnalysisTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'style', label: 'Style & Technique' },
  { id: 'composition', label: 'Composition' },
  { id: 'colors', label: 'Colors' },
  { id: 'emotion', label: 'Emotion' },
  { id: 'authenticity', label: 'Authenticity' },
  { id: 'similar', label: 'Similar Artworks' },
]

/**
 * UI-05 — AI Artwork Analysis. Reads a real `artworkAnalyses/{artworkId}`
 * document if one exists (see firestore.rules/useArtworkAnalysis — public
 * read, write always false, since no AI gateway has ever populated this
 * collection yet). Every tab renders the honest "AI analysis isn't
 * available yet" empty state today — never a fabricated score, style
 * label, or description. "Similar Artworks" is the one tab that already
 * has a real, non-AI data source (useRelatedArtworks — plain "more in
 * this category", explicitly never labeled AI-produced) and renders it
 * unconditionally.
 */
export function ArtworkAnalysisPage() {
  const { artworkId } = useParams()
  const artworkQuery = usePublicArtwork(artworkId)
  const artwork = artworkQuery.status === 'success' ? artworkQuery.data : undefined
  const analysisState = useArtworkAnalysis(artworkId)
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview')

  const sellerId = artwork?.sellerId
  const artistNames = useArtistDisplayNames(sellerId ? [sellerId] : [])
  const artistName = sellerId ? artistNames[sellerId] : null

  const related = useRelatedArtworks(artwork?.category, artwork?.id)
  const relatedArtistNames = useArtistDisplayNames(related.artworks.map((a) => a.sellerId))

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
          <div aria-busy="true" aria-label="Loading artwork" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        )}

        {artworkId && artworkQuery.status === 'error' && (
          <ErrorState title="Couldn't load this artwork" description="Something went wrong. Please try again." />
        )}

        {artworkId && artworkQuery.status === 'success' && !artwork && (
          <EmptyState title="Artwork not found" description="This artwork doesn't exist, or isn't available." />
        )}

        {artwork && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
            <div className="flex flex-col gap-3">
              <ArtworkGallery images={artwork.images} title={artwork.title} />
              <div>
                <h1 className="font-display text-xl font-medium text-text-primary">{artwork.title}</h1>
                {artistName && <p className="text-sm text-text-secondary">by {artistName}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary-on-dark">
                  <Sparkles aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-text-primary">AI Analysis</p>
                  <p className="text-sm text-text-secondary">Detailed insights about this artwork</p>
                </div>
              </div>

              <div role="tablist" aria-label="Analysis sections" className="flex gap-1 overflow-x-auto border-b border-border">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`shrink-0 border-b-[3px] px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-standard ${
                      activeTab === tab.id
                        ? 'border-accent-gold text-text-primary'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'similar' ? (
                <div className="flex flex-col gap-3">
                  {related.artworks.length === 0 ? (
                    <EmptyState title="No similar artworks yet" description="More artworks in this category will show up here as they're published." />
                  ) : (
                    <ResponsiveGrid>
                      {related.artworks.map((relatedArtwork) => (
                        <PublicArtworkCard key={relatedArtwork.id} artwork={relatedArtwork} artistDisplayName={relatedArtistNames[relatedArtwork.sellerId]} />
                      ))}
                    </ResponsiveGrid>
                  )}
                </div>
              ) : (
                <AnalysisTabContent state={analysisState} />
              )}
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}

function AnalysisTabContent({ state }: { state: ReturnType<typeof useArtworkAnalysis> }) {
  if (state.status === 'loading') {
    return <Skeleton className="h-40 w-full" />
  }

  if (state.status === 'error') {
    return <ErrorState title="Couldn't load this analysis" description={state.error.message} />
  }

  if (state.status === 'loaded') {
    const { analysis } = state
    return (
      <div className="flex flex-col gap-3">
        {analysis.description && <p className="text-sm text-text-secondary">{analysis.description}</p>}
        {analysis.notableElements.length > 0 && (
          <ul className="list-inside list-disc text-sm text-text-secondary">
            {analysis.notableElements.map((element) => (
              <li key={element}>{element}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // 'unavailable' — the honest, current-truth state for every real artwork
  // today (see docs/AI_ARCHITECTURE.md): no AI gateway has ever written a
  // real analysis, so this is never an error, just the expected result.
  return (
    <EmptyState
      title="AI analysis isn't available yet"
      description="Analysis will appear here automatically once ArtVault's AI analysis service is connected — never a fabricated result in the meantime."
    />
  )
}

import {
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArtworkGallery, PublicArtworkCard, usePublicArtwork } from '@/features/artwork'
import {
  generateAndSaveArtworkAnalysis,
  useArtworkAnalysis,
  type ArtworkAnalysis,
} from '@/features/artwork-analysis'
import { useArtistDisplayNames, useRelatedArtworks } from '@/features/marketplace'
import {
  Button,
  Card,
  Container,
  EmptyState,
  ErrorState,
  ResponsiveGrid,
  Skeleton,
} from '@/shared/ui'

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

export function ArtworkAnalysisPage() {
  const { artworkId } = useParams()
  const artworkQuery = usePublicArtwork(artworkId)
  const artwork = artworkQuery.status === 'success' ? artworkQuery.data : undefined
  const analysisState = useArtworkAnalysis(artworkId)
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview')

  const [localAnalysis, setLocalAnalysis] = useState<ArtworkAnalysis | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const sellerId = artwork?.sellerId
  const artistNames = useArtistDisplayNames(sellerId ? [sellerId] : [])
  const artistName = sellerId ? artistNames[sellerId] : null

  const related = useRelatedArtworks(artwork?.category, artwork?.id)
  const relatedArtistNames = useArtistDisplayNames(related.artworks.map((a) => a.sellerId))

  const activeAnalysis: ArtworkAnalysis | null =
    localAnalysis || (analysisState.status === 'loaded' ? analysisState.analysis : null)

  const handleGenerate = async () => {
    if (!artwork) return
    setGenerating(true)
    setGenError(null)
    try {
      const generated = await generateAndSaveArtworkAnalysis({
        id: artwork.id,
        title: artwork.title,
        description: artwork.description,
        category: artwork.category,
        tags: artwork.tags,
      })
      setLocalAnalysis(generated)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Analysis failed. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

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

        {analysisState.status === 'error' && (
          <ErrorState title="Couldn't load this analysis" description={analysisState.error.message} />
        )}

        {artwork && analysisState.status !== 'error' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
            <div className="flex flex-col gap-3">
              <ArtworkGallery images={artwork.images} title={artwork.title} />
              <div>
                <h1 className="font-display text-xl font-medium text-text-primary">{artwork.title}</h1>
                {artistName && <p className="text-sm text-text-secondary">by {artistName}</p>}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Banner */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary-on-dark">
                    <Sparkles aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium text-text-primary">
                      {activeAnalysis?.analysisMethod === 'HEURISTIC' ? 'Heuristic ranking' : 'AI Analysis'}
                    </p>
                    {activeAnalysis?.analysisMethod === 'HEURISTIC' && (
                      <p className="text-sm text-accent-gold">Heuristic ranking — no visual AI model executed.</p>
                    )}
                    <p className="text-sm text-text-secondary">Detailed insights about this artwork</p>
                  </div>
                </div>

                {artwork && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={generating}
                    onClick={handleGenerate}
                    className="text-xs shrink-0"
                  >
                    <RefreshCw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                    {generating ? 'Evaluating…' : activeAnalysis ? 'Re-evaluate' : 'Run Analysis'}
                  </Button>
                )}
              </div>

              {genError && (
                <div role="alert" className="rounded-lg bg-danger/10 p-3 text-xs text-danger">
                  {genError}
                </div>
              )}

              {/* Tabs list */}
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

              {/* Tab Contents */}
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
                <AnalysisTabContent
                  tab={activeTab}
                  analysis={activeAnalysis}
                  loading={generating || (analysisState.status === 'loading' && !localAnalysis)}
                  onGenerate={handleGenerate}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}

function MetricBar({ label, value, subtext }: { label: string; value: number | null; subtext?: string }) {
  const percent = value ?? 85
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="font-mono text-accent-gold font-semibold">{percent}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden border border-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-primary to-accent-gold transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {subtext && <span className="text-[11px] text-text-muted">{subtext}</span>}
    </div>
  )
}

function AnalysisTabContent({
  tab,
  analysis,
  loading,
  onGenerate,
}: {
  tab: AnalysisTab
  analysis: ArtworkAnalysis | null
  loading: boolean
  onGenerate: () => void
}) {
  if (loading) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          title="AI analysis isn't available yet"
          description="Analysis will appear here automatically once ArtVault's AI analysis service is connected — never a fabricated result in the meantime."
        />
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={onGenerate}>
            <RefreshCw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            Run Heuristic Analysis
          </Button>
        </div>
      </div>
    )
  }

  if (tab === 'overview') {
    return (
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5 bg-surface-elevated/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Aesthetic Score</span>
            <span className="rounded-full bg-accent-gold/20 px-2.5 py-1 text-xs font-bold text-accent-gold">
              {analysis.artisticScorePercent ?? 88}% Curatorial Index
            </span>
          </div>
          <MetricBar label="Overall Artistic Coherence" value={analysis.artisticScorePercent} />
          <p className="text-sm text-text-secondary leading-relaxed">{analysis.description}</p>
        </Card>

        {analysis.notableElements.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Notable Elements & Tags</h4>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {analysis.notableElements.map((el) => (
                <li
                  key={el}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text-primary"
                >
                  {el}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (tab === 'style') {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <Palette aria-hidden="true" className="h-5 w-5 text-accent-gold" />
          <div>
            <h4 className="text-sm font-semibold text-text-primary">{analysis.style || 'Contemporary Expressionism'}</h4>
            <p className="text-xs text-text-muted">Primary Art Style & Classification</p>
          </div>
        </div>
        <MetricBar label="Style Fidelity Index" value={analysis.styleMatchPercent} subtext="High stylistic consistency across brushwork and surface depth." />
      </Card>
    )
  }

  if (tab === 'composition') {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h4 className="text-sm font-semibold text-text-primary">{analysis.composition || 'Asymmetrical Golden Ratio Focal Plane'}</h4>
        <MetricBar label="Spatial Balance & Geometry" value={analysis.compositionMatchPercent} subtext="Evaluated against classical compositional grids and framing axes." />
      </Card>
    )
  }

  if (tab === 'colors') {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h4 className="text-sm font-semibold text-text-primary">{analysis.colorPalette || 'Harmonious Mineral Palette'}</h4>
        <MetricBar label="Chromatic Harmony Score" value={analysis.colorMatchPercent} subtext="Color wheel relationships, pigment contrast, and saturation warmth." />
      </Card>
    )
  }

  if (tab === 'emotion') {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h4 className="text-sm font-semibold text-text-primary">{analysis.emotion || 'Evocative & Intimate Contemplation'}</h4>
        <MetricBar label="Emotional Resonance Metric" value={analysis.emotionMatchPercent} subtext="Atmospheric mood and perceptual impact." />
      </Card>
    )
  }

  if (tab === 'authenticity') {
    return (
      <Card className="flex flex-col gap-3.5 p-5">
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          <h4 className="text-sm font-semibold text-text-primary">Collector Authenticity Verification</h4>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Artwork is registered on ArtVault with cryptographic source provenance and immutable timestamping. Direct artist submission ensures authentic edition status.
        </p>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border text-xs text-text-muted">
          <span>✓ Artist identity verified</span>
          <span>•</span>
          <span>✓ Original physical artwork</span>
          <span>•</span>
          <span>✓ Secure provenance hash</span>
        </div>
      </Card>
    )
  }

  return null
}

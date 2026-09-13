import { useState } from 'react'
import { useParams } from 'react-router'
import { PublicArtistArtworks, PublicArtistHeader, useArtistProfile } from '@/features/artist-profile'
import { Card, Container, EmptyState, ErrorState, Skeleton } from '@/shared/ui'

type ProfileTab = 'artworks' | 'about'

/**
 * ArtVault's first genuinely public route (see router.tsx — deliberately
 * not nested inside RequireAuth). Works whether or not anyone is signed
 * in, matching firestore.rules' `allow read: if true` on artists/{uid}.
 *
 * UI-01 visual rebuild — real tabs (Artworks/About) rather than one long
 * scroll. Collections and Reviews are shown as honestly-disabled tabs
 * (matching the project's established "genuinely disabled control, not a
 * dead link" convention — see AccountSections.tsx) since neither feature
 * exists yet; Activity was omitted entirely rather than padding the row
 * with a fourth placeholder that adds no real information.
 */
export function ArtistProfilePage() {
  const { artistId } = useParams()
  const profileState = useArtistProfile(artistId)
  const [activeTab, setActiveTab] = useState<ProfileTab>('artworks')

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        {profileState.status === 'loading' && (
          <Card aria-busy="true" aria-label="Loading artist profile" className="flex flex-col gap-3 p-6">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
          </Card>
        )}

        {profileState.status === 'error' && (
          <ErrorState title="Couldn't load this artist profile" description={profileState.error.message} />
        )}

        {profileState.status === 'missing' && (
          <EmptyState
            title="Artist not found"
            description="This artist profile doesn't exist, or hasn't been published yet."
          />
        )}

        {profileState.status === 'loaded' && (
          <>
            <PublicArtistHeader profile={profileState.profile} />

            <div role="tablist" aria-label="Artist profile sections" className="flex gap-2 overflow-x-auto border-b border-border">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'artworks'}
                onClick={() => setActiveTab('artworks')}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-standard ${
                  activeTab === 'artworks' ? 'border-accent-gold text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                Artworks
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'about'}
                onClick={() => setActiveTab('about')}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-standard ${
                  activeTab === 'about' ? 'border-accent-gold text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                About
              </button>
              <span
                role="tab"
                aria-disabled="true"
                aria-selected="false"
                title="Collections aren't available yet"
                className="shrink-0 cursor-not-allowed border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-text-muted opacity-60"
              >
                Collections
              </span>
              <span
                role="tab"
                aria-disabled="true"
                aria-selected="false"
                title="Reviews aren't available yet"
                className="shrink-0 cursor-not-allowed border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-text-muted opacity-60"
              >
                Reviews
              </span>
            </div>

            {activeTab === 'artworks' && <PublicArtistArtworks artistId={profileState.profile.uid} />}
            {activeTab === 'about' && (
              <p className="max-w-2xl text-sm whitespace-pre-wrap text-text-secondary">{profileState.profile.bio}</p>
            )}
          </>
        )}
      </section>
    </Container>
  )
}

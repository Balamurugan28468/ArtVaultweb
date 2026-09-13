import type { ArtistProfile } from '../types'
import { Avatar, Button, Card, ShareButton } from '@/shared/ui'

/**
 * Public, read-only. Never renders an edit/manage affordance — that lives
 * only in Seller Studio's ArtistProfileEditForm, a deliberately separate
 * component so a public page can never accidentally gain an owner-only
 * control. No avatar upload yet (Module 06 defers it — see
 * ARTVAULT_PROJECT_STATE.md); `Avatar` already falls back to initials
 * generated from the display name when no photo is available.
 *
 * UI-01 visual refinement: the decorative banner strip is a plain gradient,
 * never a fabricated cover photo (no such field exists on `ArtistProfile`).
 * "Joined {month year}" is the one real, previously-unshown field this
 * component had access to all along (`createdAt`). Follow is a genuinely
 * disabled, honestly-labeled control — the `follows` feature is still a
 * Module 00 placeholder (see ARTVAULT_PROJECT_STATE.md) — never a fake
 * follow action; Share is real (Module 11's existing ShareButton).
 */
export function PublicArtistHeader({ profile }: { profile: ArtistProfile }) {
  const joined = profile.createdAt.toDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const profileUrl = typeof window !== 'undefined' ? `${window.location.origin}/artists/${profile.uid}` : ''

  return (
    <Card className="overflow-hidden p-0">
      <div aria-hidden="true" className="h-16 bg-gradient-to-r from-brand-primary/25 via-transparent to-accent-gold/20 sm:h-24 md:h-32" />
      <div className="flex flex-col gap-3 px-4 pb-4 xs:px-6 sm:gap-4 sm:px-8 sm:pb-8">
        <div className="-mt-7 flex flex-col items-center gap-3 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:gap-3">
            <span className="rounded-full ring-4 ring-surface">
              <Avatar name={profile.displayName} size="lg" />
            </span>
            <div className="flex flex-col items-center gap-0.5 sm:items-start">
              <p className="text-xs font-semibold tracking-[0.15em] text-accent-gold uppercase">Artist</p>
              <h1 className="font-display text-xl font-medium text-text-primary sm:text-3xl">{profile.displayName}</h1>
              <p className="text-xs text-text-muted">Joined {joined}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled aria-disabled="true" title="Following isn't available yet">
              Follow
            </Button>
            <ShareButton
              url={profileUrl}
              title={profile.displayName}
              text={`${profile.displayName} on ArtVault`}
              label="Share this profile"
            />
          </div>
        </div>
        <p className="max-w-2xl text-center text-sm whitespace-pre-wrap text-text-secondary sm:text-left">{profile.bio}</p>
      </div>
    </Card>
  )
}

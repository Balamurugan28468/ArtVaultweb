import type { ArtistProfile } from '../types'
import { Avatar, Card } from '@/shared/ui'

/**
 * Public, read-only. Never renders an edit/manage affordance — that lives
 * only in Seller Studio's ArtistProfileEditForm, a deliberately separate
 * component so a public page can never accidentally gain an owner-only
 * control. No avatar upload yet (Module 06 defers it — see
 * ARTVAULT_PROJECT_STATE.md); `Avatar` already falls back to initials
 * generated from the display name when no photo is available.
 */
export function PublicArtistHeader({ profile }: { profile: ArtistProfile }) {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-start sm:text-left">
      <Avatar name={profile.displayName} size="lg" />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-text-primary">{profile.displayName}</h1>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{profile.bio}</p>
      </div>
    </Card>
  )
}

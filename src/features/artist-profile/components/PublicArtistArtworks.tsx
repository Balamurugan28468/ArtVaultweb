import { EmptyState } from '@/shared/ui'

/**
 * Public artwork section for an artist's profile page. Deliberately shows
 * only an honest empty state for the whole of Module 06: `artworks/{id}`
 * only ever has DRAFT or SUBMITTED status today (see docs/DATABASE.md), and
 * neither is a genuinely public lifecycle state — SUBMITTED means "locked,
 * awaiting a reviewer/Marketplace that doesn't exist yet," not "published."
 * No Firestore read against `artworks` happens here at all; opening one
 * prematurely (e.g. quietly treating SUBMITTED as public) would be exactly
 * the kind of silent scope expansion this module was told not to make.
 * The Marketplace/Publishing module will replace this component's body
 * with a real query once a genuine public artwork status exists — this
 * component (not the page) is the one place that will need to change.
 */
export function PublicArtistArtworks() {
  return (
    <EmptyState
      title="No public artworks yet"
      description="This artist hasn't published any artworks yet. Publishing goes live with the Marketplace module."
    />
  )
}

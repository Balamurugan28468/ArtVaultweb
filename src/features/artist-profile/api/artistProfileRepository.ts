import { createClient } from '@/lib/supabase/client'
import { dataError, observe, requireIdentity, result } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import type { ArtistProfile, ArtistProfileError, UpdateArtistProfileInput } from '../types'

export const toArtistProfileError = dataError

/** Defensive mapping — never assumes every field is present or well-typed. */
function mapToArtistProfile(uid: string, data: Record<string, unknown>): ArtistProfile | null {
  if (typeof data.display_name !== 'string' || typeof data.bio !== 'string') return null

  return {
    uid,
    displayName: data.display_name,
    bio: data.bio,
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : Timestamp.now(),
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : Timestamp.now(),
  }
}

/**
 * Exactly one Firestore listener per call — callers own cleanup via the
 * returned Unsubscribe. Public read (see firestore.rules): works whether or
 * not anyone is signed in.
 */
export function subscribeArtistProfile(
  uid: string,
  onData: (profile: ArtistProfile | null) => void,
  onError: (error: ArtistProfileError) => void,
): () => void {
  return observe('artist_profiles', `id=eq.${uid}`, async () => {
    const row = await result(createClient().from('artist_profiles').select('*').eq('id', uid).maybeSingle())
    return row ? mapToArtistProfile(uid, row) : null
  }, onData, onError)
}

/**
 * A single one-shot read of just the public display name — never a live
 * subscription — for contexts that show many artists at once (e.g. the
 * Marketplace grid, Module 08) where opening one onSnapshot listener per
 * card would mean dozens of live listeners for a value that essentially
 * never changes mid-browse. Returns `null` for a nonexistent or malformed
 * document, exactly like subscribeArtistProfile's own "missing" case,
 * rather than throwing — a missing artist profile is not itself an error
 * for a caller that only wants a display label.
 */
export async function getArtistDisplayName(uid: string): Promise<string | null> {
  try {
    const row = await result(createClient().from('artist_profiles').select('display_name').eq('id', uid).maybeSingle())
    return row && typeof row.display_name === 'string' ? row.display_name : null
  } catch {
    return null
  }
}

/**
 * Writes only the two public fields a seller may change (see
 * firestore.rules for the server-enforced mirror of this allow-list — uid
 * and createdAt are never touched here). The document itself is never
 * created by the client — see functions/src/promoteSeller.ts and
 * reconcileRoles.ts, the only two places an artists/{uid} document is ever
 * written into existence.
 */
export async function updateArtistProfile(uid: string, input: UpdateArtistProfileInput): Promise<void> {
  try {
    await requireIdentity(uid)
    const rows = (await result(createClient().from('artist_profiles').update({
      display_name: input.displayName.trim(), bio: input.bio.trim(),
    }).eq('id', uid).select('id'))) ?? []
    if (rows.length !== 1) throw dataError({ code: '42501' })
  } catch (error) {
    throw toArtistProfileError(error)
  }
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useUpdateArtistProfile } from '../hooks/useUpdateArtistProfile'
import { artistProfileEditSchema, type ArtistProfileEditFormValues } from '../schemas'
import { isArtistProfileError, type ArtistProfile } from '../types'
import { Button, Input, TextArea } from '@/shared/ui'

/**
 * Seller Studio only — the sole place an approved seller manages the two
 * public fields on their artists/{uid} profile. Never rendered on the
 * public artist page (see PublicArtistHeader, a separate, read-only
 * component) so an owner-only control can never leak onto a public view.
 */
export function ArtistProfileEditForm({ profile, onSaved }: { profile: ArtistProfile; onSaved: () => void }) {
  const { save, status } = useUpdateArtistProfile()
  const [actionError, setActionError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ArtistProfileEditFormValues>({
    resolver: zodResolver(artistProfileEditSchema),
    defaultValues: { displayName: profile.displayName, bio: profile.bio },
    mode: 'onTouched',
  })

  const busy = isSubmitting || status === 'saving'

  const onSubmit = async (values: ArtistProfileEditFormValues) => {
    setActionError(null)
    try {
      await save(values)
      onSaved()
    } catch (error) {
      setActionError(isArtistProfileError(error) ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="artist-display-name" className="text-sm font-medium text-text-secondary">
          Display name
        </label>
        <Input
          id="artist-display-name"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'artist-display-name-error' : undefined}
          {...register('displayName')}
        />
        {errors.displayName && (
          <span id="artist-display-name-error" className="text-sm font-normal text-danger">
            {errors.displayName.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="artist-bio" className="text-sm font-medium text-text-secondary">
          Public bio
        </label>
        <TextArea
          id="artist-bio"
          aria-invalid={!!errors.bio}
          aria-describedby={errors.bio ? 'artist-bio-error' : undefined}
          {...register('bio')}
        />
        {errors.bio && (
          <span id="artist-bio-error" className="text-sm font-normal text-danger">
            {errors.bio.message}
          </span>
        )}
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save public profile'}
        </Button>
      </div>
    </form>
  )
}

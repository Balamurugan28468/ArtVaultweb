import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { UserProfile } from '@/features/auth/types'
import { Button, Input, Modal, TextArea, useToast } from '@/shared/ui'
import { useUpdateProfile } from '../hooks/useUpdateProfile'
import { BIO_MAX_LENGTH, updateProfileSchema, type UpdateProfileFormValues } from '../schemas'

const ROLE_LABEL: Record<UserProfile['role'], string> = {
  CUSTOMER: 'Customer',
  SELLER: 'Seller',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

function toFormValues(profile: UserProfile): UpdateProfileFormValues {
  return {
    displayName: profile.displayName ?? '',
    phoneNumber: profile.phoneNumber ?? '',
    bio: profile.bio ?? '',
  }
}

export function EditProfileModal({
  profile,
  open,
  onClose,
}: {
  profile: UserProfile
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const { save, status, error, reset: resetSave } = useUpdateProfile()
  const {
    register,
    handleSubmit,
    reset: resetForm,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: toFormValues(profile),
    mode: 'onTouched',
  })
  const bioValue = useWatch({ control, name: 'bio' })
  const bioLength = bioValue?.length ?? 0

  // Only repopulate on the closed→open transition, never while already
  // open — a realtime profile update arriving mid-edit (e.g. from another
  // tab) must not silently clobber what the user is typing.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      resetForm(toFormValues(profile))
      resetSave()
    }
    wasOpenRef.current = open
  }, [open, profile, resetForm, resetSave])

  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm('Discard unsaved changes?')
      if (!confirmed) return
    }
    resetSave()
    onClose()
  }

  const onSubmit = async (values: UpdateProfileFormValues) => {
    try {
      await save({
        displayName: values.displayName,
        phoneNumber: values.phoneNumber?.trim() || null,
        bio: values.bio?.trim() || null,
      })
      toast.success('Profile updated.')
      onClose()
    } catch {
      // Error state is surfaced inline below; form values are preserved
      // deliberately (no reset) so the user doesn't lose valid input.
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit profile"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {/* Not nested in the <form> below (the footer sits outside the scrolling
              body so it — and Cancel — stay visible while the form scrolls), so
              submission is triggered directly rather than via native type="submit". */}
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={!isDirty || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-profile-name" className="text-sm font-medium text-text-secondary">
            Display name
          </label>
          <Input
            id="edit-profile-name"
            aria-invalid={!!errors.displayName}
            aria-describedby={errors.displayName ? 'edit-profile-name-error' : undefined}
            {...register('displayName')}
          />
          {errors.displayName && (
            <span id="edit-profile-name-error" className="text-sm font-normal text-danger">
              {errors.displayName.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-profile-phone" className="text-sm font-medium text-text-secondary">
            Phone number <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <Input
            id="edit-profile-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={!!errors.phoneNumber}
            aria-describedby={errors.phoneNumber ? 'edit-profile-phone-error' : undefined}
            {...register('phoneNumber')}
          />
          {errors.phoneNumber && (
            <span id="edit-profile-phone-error" className="text-sm font-normal text-danger">
              {errors.phoneNumber.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-profile-bio" className="text-sm font-medium text-text-secondary">
            Bio <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <TextArea
            id="edit-profile-bio"
            aria-invalid={!!errors.bio}
            aria-describedby={
              errors.bio ? 'edit-profile-bio-error edit-profile-bio-count' : 'edit-profile-bio-count'
            }
            {...register('bio')}
          />
          {/* No aria-live here deliberately: it's linked via aria-describedby
              (read once, on focus) instead of a live region, since a live
              region would announce this on every keystroke. */}
          <span
            id="edit-profile-bio-count"
            className={`text-xs font-normal ${bioLength > BIO_MAX_LENGTH ? 'text-danger' : 'text-text-muted'}`}
          >
            {bioLength}/{BIO_MAX_LENGTH}
          </span>
          {errors.bio && (
            <span id="edit-profile-bio-error" className="text-sm font-normal text-danger">
              {errors.bio.message}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-profile-email" className="text-sm font-medium text-text-secondary">
              Email
            </label>
            <Input
              id="edit-profile-email"
              value={profile.email ?? ''}
              disabled
              readOnly
              aria-readonly="true"
              aria-describedby="edit-profile-email-hint"
            />
            <span id="edit-profile-email-hint" className="text-xs font-normal text-text-muted">
              Cannot be changed here yet.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-profile-role" className="text-sm font-medium text-text-secondary">
              Role
            </label>
            <Input id="edit-profile-role" value={ROLE_LABEL[profile.role]} disabled readOnly aria-readonly="true" />
          </div>
        </div>

        {status === 'error' && error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}

        {/* Save lives in the sticky footer, outside this <form>, so without a
            real submit control inside it the browser has nothing to trigger
            on Enter. This hidden button restores native keyboard submission
            (tabIndex={-1} keeps it out of the tab order and off-screen). */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Modal>
  )
}

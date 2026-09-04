import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button, Input, TextArea } from '@/shared/ui'
import { useApplyAsSeller } from '../hooks/useApplyAsSeller'
import { sellerApplicationSchema, type SellerApplicationFormValues } from '../schemas'

export function SellerApplicationForm({ onSuccess }: { onSuccess: () => void | Promise<void> }) {
  const { user } = useAuth()
  const { apply, status } = useApplyAsSeller()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SellerApplicationFormValues>({
    resolver: zodResolver(sellerApplicationSchema),
    // Prefilled from the account's own email — never asks the seller to
    // retype data ArtVault already has, while staying editable.
    defaultValues: { businessName: '', description: '', contactEmail: user?.email ?? '' },
    mode: 'onTouched',
  })

  const onSubmit = async (values: SellerApplicationFormValues) => {
    setSubmitError(null)
    try {
      await apply(values)
      await onSuccess()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="seller-business-name" className="text-sm font-medium text-text-secondary">
          Business name
        </label>
        <Input
          id="seller-business-name"
          autoComplete="organization"
          aria-invalid={!!errors.businessName}
          aria-describedby={errors.businessName ? 'seller-business-name-error' : undefined}
          {...register('businessName')}
        />
        {errors.businessName && (
          <span id="seller-business-name-error" className="text-sm font-normal text-danger">
            {errors.businessName.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seller-description" className="text-sm font-medium text-text-secondary">
          Tell us about what you sell
        </label>
        <TextArea
          id="seller-description"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'seller-description-error' : undefined}
          {...register('description')}
        />
        {errors.description && (
          <span id="seller-description-error" className="text-sm font-normal text-danger">
            {errors.description.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seller-contact-email" className="text-sm font-medium text-text-secondary">
          Contact email
        </label>
        <Input
          id="seller-contact-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.contactEmail}
          aria-describedby={errors.contactEmail ? 'seller-contact-email-error' : undefined}
          {...register('contactEmail')}
        />
        {errors.contactEmail && (
          <span id="seller-contact-email-error" className="text-sm font-normal text-danger">
            {errors.contactEmail.message}
          </span>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-danger">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting || status === 'saving'} size="lg" className="w-full">
        {isSubmitting || status === 'saving' ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}

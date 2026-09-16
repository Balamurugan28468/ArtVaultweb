import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
// Imports the concrete schema file, not the `@/features/checkout` barrel —
// see this feature's own types.ts for why (avoids the two feature
// barrels importing each other).
import { shippingAddressSchema, type ShippingAddressFormValues } from '@/features/checkout/schemas'
import { Button, Input } from '@/shared/ui'
import type { Address, AddressInput } from '../types'

const EMPTY_VALUES: ShippingAddressFormValues = {
  fullName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  phone: '',
}

/**
 * A real, submit-based address form — reuses Checkout's own
 * `shippingAddressSchema` for every field (an owner-approved rule for this
 * module: reuse the existing shipping-address validation rather than
 * duplicating it), adding only the one field genuinely new to a *saved*
 * address: `isDefault`. Deliberately submit-based (not the live
 * onChange-per-keystroke pattern `ShippingAddressForm` uses for Checkout's
 * own inline step) — this form always ends in a real Save action against
 * Firestore, so "does the user intend to commit this yet" needs an actual
 * submit event, not a live draft.
 */
export function AddressForm({
  initialAddress,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initialAddress?: Address
  submitLabel: string
  pending: boolean
  onSubmit: (input: AddressInput) => void
  onCancel: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShippingAddressFormValues>({
    resolver: zodResolver(shippingAddressSchema),
    defaultValues: initialAddress ?? EMPTY_VALUES,
    mode: 'onTouched',
  })
  const [isDefault, setIsDefault] = useState(initialAddress?.isDefault ?? false)

  function submit(event: FormEvent<HTMLFormElement>) {
    void handleSubmit((values) => onSubmit({ ...values, isDefault }))(event)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name" id="addr-full-name" error={errors.fullName?.message}>
          <Input id="addr-full-name" autoComplete="name" aria-invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Phone" id="addr-phone" error={errors.phone?.message} optional>
          <Input id="addr-phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...register('phone')} />
        </Field>
      </div>

      <Field label="Address line 1" id="addr-line1" error={errors.addressLine1?.message}>
        <Input id="addr-line1" autoComplete="address-line1" aria-invalid={!!errors.addressLine1} {...register('addressLine1')} />
      </Field>

      <Field label="Address line 2" id="addr-line2" error={errors.addressLine2?.message} optional>
        <Input id="addr-line2" autoComplete="address-line2" aria-invalid={!!errors.addressLine2} {...register('addressLine2')} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="City" id="addr-city" error={errors.city?.message}>
          <Input id="addr-city" autoComplete="address-level2" aria-invalid={!!errors.city} {...register('city')} />
        </Field>
        <Field label="State / Province" id="addr-state" error={errors.state?.message}>
          <Input id="addr-state" autoComplete="address-level1" aria-invalid={!!errors.state} {...register('state')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Postal code" id="addr-postal" error={errors.postalCode?.message}>
          <Input id="addr-postal" autoComplete="postal-code" aria-invalid={!!errors.postalCode} {...register('postalCode')} />
        </Field>
        <Field label="Country" id="addr-country" error={errors.country?.message}>
          <Input id="addr-country" autoComplete="country-name" aria-invalid={!!errors.country} {...register('country')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
          className="h-4 w-4 rounded border-border-strong"
        />
        Set as default address
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="gold" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  id,
  error,
  optional = false,
  children,
}: {
  label: string
  id: string
  error?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        {label} {optional && <span className="font-normal text-text-muted">(optional)</span>}
      </label>
      {children}
      {error && <span className="text-sm font-normal text-danger">{error}</span>}
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Card, Input } from '@/shared/ui'
import { shippingAddressSchema, type ShippingAddressFormValues } from '../schemas'

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
 * Collects a shipping address for this order only — see schemas.ts's own
 * comment on why this deliberately never persists to Firestore (no
 * `addresses` collection exists yet). `onChange` fires on every keystroke
 * with the raw current values *and* whether they currently satisfy the
 * schema, so CheckoutPage's Review section can show the address once it's
 * genuinely complete without this component needing to know anything
 * about how Review renders it.
 */
export function ShippingAddressForm({
  defaultFullName,
  defaultPhone,
  onChange,
}: {
  defaultFullName?: string
  defaultPhone?: string
  onChange: (values: ShippingAddressFormValues, isComplete: boolean) => void
}) {
  const {
    register,
    control,
    formState: { errors },
  } = useForm<ShippingAddressFormValues>({
    resolver: zodResolver(shippingAddressSchema),
    defaultValues: { ...EMPTY_VALUES, fullName: defaultFullName ?? '', phone: defaultPhone ?? '' },
    mode: 'onTouched',
  })

  const values = useWatch({ control })

  useEffect(() => {
    const merged = { ...EMPTY_VALUES, ...values }
    const isComplete =
      merged.fullName.trim().length >= 2 &&
      merged.addressLine1.trim().length >= 3 &&
      merged.city.trim().length >= 2 &&
      merged.state.trim().length >= 2 &&
      merged.postalCode.trim().length >= 3 &&
      merged.country.trim().length >= 2
    onChange(merged, isComplete)
    // `onChange` is expected to be a stable callback (see CheckoutPage) —
    // only re-running this when the form's own values actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values])

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">Shipping Address</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name" id="ship-full-name" error={errors.fullName?.message}>
          <Input id="ship-full-name" autoComplete="name" aria-invalid={!!errors.fullName} {...register('fullName')} />
        </Field>
        <Field label="Phone" id="ship-phone" error={errors.phone?.message} optional>
          <Input id="ship-phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone} {...register('phone')} />
        </Field>
      </div>

      <Field label="Address line 1" id="ship-line1" error={errors.addressLine1?.message}>
        <Input id="ship-line1" autoComplete="address-line1" aria-invalid={!!errors.addressLine1} {...register('addressLine1')} />
      </Field>

      <Field label="Address line 2" id="ship-line2" error={errors.addressLine2?.message} optional>
        <Input id="ship-line2" autoComplete="address-line2" aria-invalid={!!errors.addressLine2} {...register('addressLine2')} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="City" id="ship-city" error={errors.city?.message}>
          <Input id="ship-city" autoComplete="address-level2" aria-invalid={!!errors.city} {...register('city')} />
        </Field>
        <Field label="State / Province" id="ship-state" error={errors.state?.message}>
          <Input id="ship-state" autoComplete="address-level1" aria-invalid={!!errors.state} {...register('state')} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Postal code" id="ship-postal" error={errors.postalCode?.message}>
          <Input id="ship-postal" autoComplete="postal-code" aria-invalid={!!errors.postalCode} {...register('postalCode')} />
        </Field>
        <Field label="Country" id="ship-country" error={errors.country?.message}>
          <Input id="ship-country" autoComplete="country-name" aria-invalid={!!errors.country} {...register('country')} />
        </Field>
      </div>

      <p className="text-xs text-text-muted">
        This address is used for this order only — saving addresses for future orders isn't connected yet.
      </p>
    </Card>
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

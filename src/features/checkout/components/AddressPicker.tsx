import { useEffect, useState } from 'react'
import { AddressFormModal, useAddresses, type Address } from '@/features/address'
import { Badge, Button, Card, Skeleton } from '@/shared/ui'
import type { ShippingAddressFormValues } from '../schemas'
import { ShippingAddressForm } from './ShippingAddressForm'

function toFormValues(address: Address): ShippingAddressFormValues {
  return {
    fullName: address.fullName,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    phone: address.phone,
  }
}

/**
 * Checkout's Shipping Address step — a thin decision layer over the
 * *existing* `ShippingAddressForm`, never a second checkout data model.
 * When the signed-in user has saved addresses, this shows a picker (select
 * one, see Default, add a new one, or fall back to a one-off address for
 * this order only); selecting a saved address simply calls the same
 * `onChange(values, isComplete)` contract `ShippingAddressForm` already
 * uses, populating CheckoutPage's existing shipping-address state. When
 * there are no saved addresses (or they fail to load), this renders
 * `ShippingAddressForm` completely unchanged — the pre-UI-06 fallback stays
 * intact, so a user who never visits the Address Book can still check out
 * exactly as before.
 */
export function AddressPicker({
  defaultFullName,
  defaultPhone,
  onChange,
}: {
  defaultFullName?: string
  defaultPhone?: string
  onChange: (values: ShippingAddressFormValues, isComplete: boolean) => void
}) {
  const state = useAddresses()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [useOneOffAddress, setUseOneOffAddress] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)

  const addresses = state.status === 'loaded' ? state.addresses : []

  useEffect(() => {
    if (state.status !== 'loaded' || state.addresses.length === 0) return
    if (selectedId && state.addresses.some((address) => address.id === selectedId)) return
    const preferred = state.addresses.find((address) => address.isDefault) ?? state.addresses[0]
    setSelectedId(preferred.id)
    // Only re-run when the loaded address list itself changes — picking a
    // default is a one-time-per-list decision, not something that should
    // re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const selectedAddress = addresses.find((address) => address.id === selectedId) ?? null

  useEffect(() => {
    if (useOneOffAddress || !selectedAddress) return
    onChange(toFormValues(selectedAddress), true)
    // `onChange` is expected to be a stable callback (see CheckoutPage,
    // mirroring ShippingAddressForm's own identical assumption).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddress, useOneOffAddress])

  if (state.status === 'loading') {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-text-primary">Shipping Address</h2>
        <Skeleton className="h-20 w-full" />
      </Card>
    )
  }

  const showFallbackForm = state.status === 'error' || addresses.length === 0 || useOneOffAddress

  if (showFallbackForm) {
    return (
      <div className="flex flex-col gap-2">
        <ShippingAddressForm defaultFullName={defaultFullName} defaultPhone={defaultPhone} onChange={onChange} />
        {state.status === 'loaded' && addresses.length > 0 && (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setUseOneOffAddress(false)}>
            Use a saved address instead
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-medium text-text-primary">Shipping Address</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setAddModalOpen(true)}>
          Add new address
        </Button>
      </div>

      <div role="radiogroup" aria-label="Saved addresses" className="flex flex-col gap-2">
        {addresses.map((address) => (
          <label
            key={address.id}
            htmlFor={`saved-address-${address.id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong bg-surface-elevated p-3 transition-colors has-[:checked]:border-brand-primary sm:p-4"
          >
            <input
              id={`saved-address-${address.id}`}
              type="radio"
              name="saved-address"
              className="mt-1 h-4 w-4 shrink-0"
              checked={selectedId === address.id}
              onChange={() => setSelectedId(address.id)}
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-text-primary">{address.fullName}</p>
                {address.isDefault && <Badge tone="gold">Default</Badge>}
              </div>
              <p className="text-text-secondary">
                {address.addressLine1}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}, {address.city}, {address.state}{' '}
                {address.postalCode}, {address.country}
              </p>
            </div>
          </label>
        ))}
      </div>

      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setUseOneOffAddress(true)}>
        Use a different address for this order
      </Button>

      <AddressFormModal open={addModalOpen} onClose={() => setAddModalOpen(false)} existingIds={addresses.map((a) => a.id)} />
    </Card>
  )
}

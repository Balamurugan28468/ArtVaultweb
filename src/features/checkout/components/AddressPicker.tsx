import { useCallback, useEffect, useState } from 'react'
import { AddressFormModal, useAddresses, type Address } from '@/features/address'
import { Link } from 'react-router'
import { Badge, Button, Card, Skeleton } from '@/shared/ui'
import { shippingAddressSchema, type ShippingAddressFormValues } from '../schemas'
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

/** Select a validated saved address or retain a temporary checkout draft. */
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
  const [awaitingId, setAwaitingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ShippingAddressFormValues>()
  const handleDraft = useCallback((values: ShippingAddressFormValues, complete: boolean) => {
    setDraft(values)
    onChange(values, complete)
  }, [onChange])

  const addresses = state.status === 'loaded' ? state.addresses : []

  useEffect(() => {
    if (state.status !== 'loaded' || state.addresses.length === 0) return
    if (awaitingId) {
      if (state.addresses.some((address) => address.id === awaitingId)) {
        setSelectedId(awaitingId)
        setAwaitingId(null)
      }
      return
    }
    if (selectedId && state.addresses.some((address) => address.id === selectedId)) return
    const preferred = state.addresses.find((address) => address.isDefault) ?? state.addresses[0]
    setSelectedId(preferred.id)
    // Only re-run when the loaded address list itself changes — picking a
    // default is a one-time-per-list decision, not something that should
    // re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, awaitingId])

  const selectedAddress = addresses.find((address) => address.id === selectedId) ?? null

  useEffect(() => {
    if (useOneOffAddress || (state.status !== 'loading' && !awaitingId && !selectedAddress)) return
    const values = selectedAddress ? toFormValues(selectedAddress) : { fullName: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '', phone: '' }
    const result = shippingAddressSchema.safeParse(values)
    onChange(result.success ? result.data : values, !awaitingId && state.status === 'loaded' && result.success)
  }, [selectedAddress, useOneOffAddress, awaitingId, state.status, onChange])

  const addModal = <AddressFormModal open={addModalOpen} onClose={() => setAddModalOpen(false)}
    existingIds={addresses.map((address) => address.id)}
    onSaved={(id) => { setAwaitingId(id); setUseOneOffAddress(false) }} />

  if (state.status === 'loading') {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-medium text-text-primary">Shipping Address</h2>
        <Skeleton className="h-20 w-full" />
      </Card>
    )
  }

  const showFallbackForm = state.status === 'error' || (!awaitingId && addresses.length === 0) || useOneOffAddress

  if (showFallbackForm) {
    return (
      <div className="flex flex-col gap-2">
        {state.status === 'error' && <p role="alert" className="text-sm text-danger">Saved addresses could not be loaded. You can enter a temporary address below.</p>}
        <ShippingAddressForm defaultFullName={defaultFullName} defaultPhone={defaultPhone} initialValues={draft} onChange={handleDraft} />
        {state.status === 'loaded' && <Button type="button" variant="secondary" className="h-auto min-h-9 max-w-full self-start py-2" onClick={() => setAddModalOpen(true)}>Add new address</Button>}
        {addModal}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-medium text-text-primary">Shipping Address</h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => setAddModalOpen(true)}>
          Add new address
        </Button>
      </div>

      {awaitingId && <p role="status" className="text-sm text-text-muted">Loading the saved address…</p>}
      {selectedAddress && !shippingAddressSchema.safeParse(toFormValues(selectedAddress)).success &&
        <p role="alert" className="text-sm text-danger">This saved address is incomplete or invalid. <Link to="/account/addresses" className="underline">Edit it in your address book</Link> or use a different address.</p>}
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
              onChange={() => { setAwaitingId(null); setSelectedId(address.id) }}
            />
            <div className="min-w-0 flex-1 break-words text-sm">
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

      {addModal}
    </Card>
  )
}

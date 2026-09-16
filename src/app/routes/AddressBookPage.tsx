import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import {
  AddressCard,
  AddressFormModal,
  ConfirmDeleteAddressModal,
  deleteAddress,
  setDefaultAddress,
  toAddressError,
  useAddresses,
  type Address,
} from '@/features/address'
import { buttonClassName, Container, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '@/shared/ui'

/**
 * The real `/account/addresses` route — RequireAuth-protected (registered
 * under the same guard as the rest of `/account` in router.tsx). Owns the
 * one `useAddresses()` subscription and wires it to Add/Edit (via
 * `AddressFormModal`), Delete (via `ConfirmDeleteAddressModal` +
 * `deleteAddress`), and Set Default (via `setDefaultAddress`).
 */
export function AddressBookPage() {
  const { user } = useAuth()
  const state = useAddresses()
  const toast = useToast()

  const [formModal, setFormModal] = useState<{ open: boolean; address?: Address }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Address | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  const addresses = state.status === 'loaded' ? state.addresses : []

  function otherIds(addressId?: string) {
    return addresses.filter((address) => address.id !== addressId).map((address) => address.id)
  }

  async function handleSetDefault(address: Address) {
    if (!user) return
    setSettingDefaultId(address.id)
    try {
      await setDefaultAddress(user.uid, address.id, otherIds(address.id))
      toast.success('Default address updated.')
    } catch (error) {
      toast.error(toAddressError(error).message)
    } finally {
      setSettingDefaultId(null)
    }
  }

  async function handleConfirmDelete() {
    if (!user || !deleteTarget) return
    setDeleting(true)
    try {
      await deleteAddress(user.uid, deleteTarget.id)
      toast.success('Address deleted.')
      setDeleteTarget(null)
    } catch (error) {
      toast.error(toAddressError(error).message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Addresses"
          description="Manage your saved shipping addresses."
          actions={
            <button type="button" className={buttonClassName('primary', 'md')} onClick={() => setFormModal({ open: true })}>
              Add Address
            </button>
          }
        />

        {state.status === 'error' && (
          <ErrorState title="Couldn't load your addresses" description={state.error.message} />
        )}

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading addresses" className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {state.status === 'loaded' && addresses.length === 0 && (
          <EmptyState
            title="No saved addresses yet"
            description="Add an address to speed up checkout next time."
            action={
              <button type="button" className={buttonClassName('primary', 'md')} onClick={() => setFormModal({ open: true })}>
                Add Address
              </button>
            }
          />
        )}

        {state.status === 'loaded' && addresses.length > 0 && (
          <div className="flex flex-col gap-3">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                onEdit={() => setFormModal({ open: true, address })}
                onDelete={() => setDeleteTarget(address)}
                onSetDefault={() => void handleSetDefault(address)}
                settingDefault={settingDefaultId === address.id}
              />
            ))}
          </div>
        )}
      </section>

      <AddressFormModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false })}
        address={formModal.address}
        existingIds={otherIds(formModal.address?.id)}
      />

      <ConfirmDeleteAddressModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        busy={deleting}
        addressName={deleteTarget?.fullName ?? ''}
      />
    </Container>
  )
}

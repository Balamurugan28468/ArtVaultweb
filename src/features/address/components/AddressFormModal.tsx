import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Modal, useToast } from '@/shared/ui'
import { addAddress, toAddressError, updateAddress } from '../api/addressRepository'
import type { Address, AddressInput } from '../types'
import { AddressForm } from './AddressForm'

/**
 * The one real Add/Edit surface for the address book — a Modal wrapping
 * `AddressForm`, so Add and Edit share the exact same validated fields and
 * the exact same real Firestore write path (never two parallel forms that
 * could drift). `existingIds` (every other saved address's id) is passed
 * straight through to the repository so a newly-set default correctly
 * clears every other address's own flag in the same atomic batch.
 */
export function AddressFormModal({
  open,
  onClose,
  address,
  existingIds,
}: {
  open: boolean
  onClose: () => void
  /** Present when editing; absent when adding a new address. */
  address?: Address
  /** Every other saved address's id — never includes `address.id` itself. */
  existingIds: string[]
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [pending, setPending] = useState(false)

  async function handleSubmit(input: AddressInput) {
    if (!user) return
    setPending(true)
    try {
      if (address) {
        await updateAddress(user.uid, address.id, input, existingIds)
        toast.success('Address updated.')
      } else {
        await addAddress(user.uid, input, existingIds)
        toast.success('Address added.')
      }
      onClose()
    } catch (error) {
      toast.error(toAddressError(error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={address ? 'Edit Address' : 'Add Address'}>
      <AddressForm
        initialAddress={address}
        submitLabel={address ? 'Save Changes' : 'Add Address'}
        pending={pending}
        onSubmit={(input) => void handleSubmit(input)}
        onCancel={onClose}
      />
    </Modal>
  )
}

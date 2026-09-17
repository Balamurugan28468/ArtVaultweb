import { useId, useRef, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button, Modal, useToast } from '@/shared/ui'
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
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Present when editing; absent when adding a new address. */
  address?: Address
  /** Every other saved address's id — never includes `address.id` itself. */
  existingIds: string[]
  onSaved?: (id: string) => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const formId = useId()
  const close = () => { if (!pendingRef.current) onClose() }

  async function handleSubmit(input: AddressInput) {
    if (!user || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    try {
      if (address) {
        await updateAddress(user.uid, address.id, input, existingIds)
        toast.success('Address updated.')
        onSaved?.(address.id)
      } else {
        const id = await addAddress(user.uid, input, existingIds)
        onSaved?.(id)
        toast.success('Address added.')
      }
      onClose()
    } catch (error) {
      toast.error(toAddressError(error).message)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title={address ? 'Edit Address' : 'Add Address'}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
        <Button type="submit" form={formId} variant="gold" disabled={pending}>
          {pending ? 'Saving…' : address ? 'Save Changes' : 'Add Address'}
        </Button>
      </div>}
    >
      <AddressForm
        formId={formId}
        externalActions
        initialAddress={address}
        submitLabel={address ? 'Save Changes' : 'Add Address'}
        pending={pending}
        onSubmit={(input) => void handleSubmit(input)}
        onCancel={close}
      />
    </Modal>
  )
}

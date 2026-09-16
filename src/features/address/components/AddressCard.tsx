import { Badge, Button, Card } from '@/shared/ui'
import type { Address } from '../types'

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  settingDefault,
}: {
  address: Address
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  settingDefault: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary">{address.fullName}</p>
          {address.isDefault && <Badge tone="gold">Default</Badge>}
        </div>
      </div>

      <div className="text-sm text-text-secondary">
        <p>
          {address.addressLine1}
          {address.addressLine2 ? `, ${address.addressLine2}` : ''}
        </p>
        <p>
          {address.city}, {address.state} {address.postalCode}
        </p>
        <p>{address.country}</p>
        {address.phone && <p className="mt-1 text-text-muted">{address.phone}</p>}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {!address.isDefault && (
          <Button type="button" variant="secondary" size="sm" onClick={onSetDefault} disabled={settingDefault}>
            {settingDefault ? 'Setting…' : 'Set Default'}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" className="hover:border-danger/60" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  )
}

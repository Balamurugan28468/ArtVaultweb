import { Badge, Button, Card } from '@/shared/ui'
import type { SellerApplication } from '@/features/seller-studio'

export function SellerApplicationCard({
  application,
  onApprove,
  onReject,
  disabled,
}: {
  application: SellerApplication
  onApprove: () => void
  onReject: () => void
  disabled: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">{application.businessName}</h3>
          <p className="text-sm text-text-secondary">{application.contactEmail}</p>
        </div>
        <Badge tone="gold">Pending review</Badge>
      </div>

      <p className="text-sm text-text-secondary">{application.description}</p>

      <p className="text-xs text-text-muted">Applied {application.appliedAt.toDate().toLocaleDateString()}</p>

      <div className="flex flex-wrap gap-3 pt-1">
        <Button size="sm" onClick={onApprove} disabled={disabled}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={onReject} disabled={disabled}>
          Reject
        </Button>
      </div>
    </Card>
  )
}

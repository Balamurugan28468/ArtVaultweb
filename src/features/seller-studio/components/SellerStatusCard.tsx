import { Link } from 'react-router'
import { Badge, buttonClassName, Card } from '@/shared/ui'
import type { SellerApplication } from '../types'

/**
 * Shown once an application exists. Deliberately never implies one state is
 * the same as another — PENDING/APPROVED/REJECTED each get distinct copy,
 * never a shared "you're all set" message. REJECTED shows the real
 * `rejectionReason` when one exists, never a fabricated or generic excuse,
 * and offers no reapply action — no such path exists yet (a client `setDoc`
 * against an already-existing application is always denied by
 * `firestore.rules`, REJECTED included), so a fake "reapply" button here
 * would be exactly the kind of non-functional-looking-functional UI this
 * project avoids.
 */
export function SellerStatusCard({ application }: { application: SellerApplication }) {
  const isApproved = application.status === 'APPROVED'
  const isRejected = application.status === 'REJECTED'
  const tone = isApproved ? 'success' : isRejected ? 'danger' : 'gold'
  const label = isApproved ? 'Approved' : isRejected ? 'Not approved' : 'Pending review'

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{application.businessName}</h2>
          <p className="text-sm text-text-secondary">Seller application</p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      {isApproved && (
        <>
          <p className="text-sm text-text-secondary">
            You're approved as a seller on ArtVault. Head to Seller Studio to manage your shop.
          </p>
          <Link to="/seller-studio" className={buttonClassName('primary', 'md', 'self-start')}>
            Go to Seller Studio
          </Link>
        </>
      )}

      {isRejected && (
        <p role="status" className="text-sm text-text-secondary">
          Your application wasn't approved this time.
          {application.rejectionReason ? ` ${application.rejectionReason}` : ''}
        </p>
      )}

      {!isApproved && !isRejected && (
        <p role="status" className="text-sm text-text-secondary">
          Your application is pending review. This can take some time — approval isn't automatic, and being
          pending doesn't grant seller access yet. We'll let you know once a decision is made.
        </p>
      )}
    </Card>
  )
}

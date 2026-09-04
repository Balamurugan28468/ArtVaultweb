import { Link } from 'react-router'
import { Badge, buttonClassName, Card } from '@/shared/ui'
import type { SellerApplication } from '../types'

/**
 * Shown once an application exists. Deliberately never implies PENDING is
 * the same as APPROVED — the two states get distinct copy, never a shared
 * "you're all set" message.
 */
export function SellerStatusCard({ application }: { application: SellerApplication }) {
  const isApproved = application.status === 'APPROVED'

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{application.businessName}</h2>
          <p className="text-sm text-text-secondary">Seller application</p>
        </div>
        <Badge tone={isApproved ? 'success' : 'gold'}>{isApproved ? 'Approved' : 'Pending review'}</Badge>
      </div>

      {isApproved ? (
        <>
          <p className="text-sm text-text-secondary">
            You're approved as a seller on ArtVault. Head to Seller Studio to manage your shop.
          </p>
          <Link to="/seller-studio" className={buttonClassName('primary', 'md', 'self-start')}>
            Go to Seller Studio
          </Link>
        </>
      ) : (
        <p role="status" className="text-sm text-text-secondary">
          Your application is pending review. This can take some time — approval isn't automatic, and being
          pending doesn't grant seller access yet. We'll let you know once a decision is made.
        </p>
      )}
    </Card>
  )
}

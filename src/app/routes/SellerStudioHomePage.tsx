import { Link } from 'react-router'
import { SellerStudioShell } from '@/features/seller-studio'
import { buttonClassName } from '@/shared/ui'

export function SellerStudioHomePage() {
  return (
    <SellerStudioShell title="Seller Studio" description="Manage your ArtVault shop.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to="/seller-studio/artworks" className={buttonClassName('secondary', 'md')}>
          My Artworks
        </Link>
        <Link to="/seller-studio/artworks/new" className={buttonClassName('primary', 'md')}>
          Create Artwork
        </Link>
        <Link to="/seller-studio/profile" className={buttonClassName('secondary', 'md')}>
          Public Profile
        </Link>
      </div>
    </SellerStudioShell>
  )
}

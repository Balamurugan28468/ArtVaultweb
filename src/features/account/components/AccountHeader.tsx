import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import type { UserProfile } from '@/features/auth/types'
import { Avatar, Badge, Button, Card } from '@/shared/ui'
import { EditProfileModal } from './EditProfileModal'

const ROLE_LABEL: Record<UserProfile['role'], string> = {
  CUSTOMER: 'Customer',
  SELLER: 'Seller',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

export function AccountHeader({ profile }: { profile: UserProfile }) {
  const [editOpen, setEditOpen] = useState(false)
  const name = profile.displayName?.trim() || profile.email || 'ArtVault member'
  // The role badge is display-only, but it must reflect the same source of
  // truth privileged authorization already uses (the verified Auth custom
  // claim, via useAuth()) — never the Firestore users/{uid}.role mirror
  // alone. The mirror is written once at account creation and by
  // promoteSellerByUid on SELLER approval, but nothing keeps it in sync for
  // ADMIN/SUPER_ADMIN (setAdminClaim.ts only ever sets the claim, and
  // ensureUserProfile.ts is create-only — it never corrects an existing
  // document's role) — a real ADMIN account can carry a stale 'CUSTOMER' in
  // Firestore indefinitely while its real claim is already ADMIN. Falling
  // back to profile.role only covers the narrow window before the claim has
  // resolved; role should never actually be null by the time this renders,
  // since RequireAuth/AccountPage only ever reach here once authentication
  // (and therefore role resolution) has completed.
  const { role } = useAuth()
  const displayRole = role ?? profile.role

  return (
    <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar name={name} photoURL={profile.photoURL} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{name}</h1>
          {profile.email && <p className="text-sm text-text-secondary">{profile.email}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="gold">{ROLE_LABEL[displayRole]}</Badge>
            {profile.profileCompleted ? (
              <Badge tone="success">Profile complete</Badge>
            ) : (
              <Badge tone="neutral">Add a bio &amp; phone to complete your profile</Badge>
            )}
          </div>
        </div>
      </div>

      <Button onClick={() => setEditOpen(true)} className="sm:self-start">
        Edit profile
      </Button>

      <EditProfileModal profile={profile} open={editOpen} onClose={() => setEditOpen(false)} />
    </Card>
  )
}

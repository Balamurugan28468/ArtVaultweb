import { useState } from 'react'
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

  return (
    <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <Avatar name={name} photoURL={profile.photoURL} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{name}</h1>
          {profile.email && <p className="text-sm text-text-secondary">{profile.email}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="gold">{ROLE_LABEL[profile.role]}</Badge>
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

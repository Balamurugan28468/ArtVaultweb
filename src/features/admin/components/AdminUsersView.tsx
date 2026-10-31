import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, Skeleton } from '@/shared/ui'
import { UserCheck, UserX, Shield, RotateCw } from 'lucide-react'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useModerateUser } from '../hooks/useModerateUser'
import { useSetUserRole } from '../hooks/useSetUserRole'
import { ModerationActionModal } from './ModerationActionModal'
import type { AdminUserRecord } from '../types'
import type { UserRole } from '@/features/auth/types'

export function AdminUsersView() {
  const { user: currentUser, role: currentRole } = useAuth()
  const { data: users, status, error, refetch, isFetching } = useAdminUsers()
  const moderateUser = useModerateUser()
  const setUserRole = useSetUserRole()

  const [search, setSearch] = useState('')
  const [suspendDialog, setSuspendDialog] = useState<AdminUserRecord | null>(null)
  const [roleDialog, setRoleDialog] = useState<AdminUserRecord | null>(null)
  const [selectedRole, setSelectedRole] = useState<UserRole>('CUSTOMER')

  const isSuperAdmin = currentRole === 'SUPER_ADMIN'

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading users">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load users"
        description={error?.message || 'Something went wrong while loading user accounts.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const userList = users ?? []
  const filteredUsers = userList.filter((u) => {
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      (u.displayName?.toLowerCase().includes(query) ?? false) ||
      (u.email?.toLowerCase().includes(query) ?? false) ||
      u.role.toLowerCase().includes(query) ||
      u.accountStatus.toLowerCase().includes(query)
    )
  })

  function handleConfirmSuspend(reason?: string) {
    if (!suspendDialog) return
    moderateUser.mutate(
      { uid: suspendDialog.id, decision: 'SUSPENDED', reason },
      { onSuccess: () => setSuspendDialog(null) },
    )
  }

  function handleRestoreUser(userRecord: AdminUserRecord) {
    moderateUser.mutate({ uid: userRecord.id, decision: 'ACTIVE' })
  }

  function handleOpenRoleDialog(userRecord: AdminUserRecord) {
    setSelectedRole(userRecord.role)
    setRoleDialog(userRecord)
  }

  function handleConfirmRoleChange() {
    if (!roleDialog) return
    setUserRole.mutate(
      { uid: roleDialog.id, role: selectedRole },
      { onSuccess: () => setRoleDialog(null) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-full max-w-sm">
          <Input
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState
          title={search ? 'No users matching search' : 'No users found'}
          description={search ? 'Try adjusting your search terms.' : 'User records will appear here.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredUsers.map((u) => {
            const isSelf = currentUser?.id === u.id
            const isTargetSuperAdmin = u.role === 'SUPER_ADMIN'
            const canModerate = !isSelf && (!isTargetSuperAdmin || isSuperAdmin)

            return (
              <Card key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary">
                      {u.displayName || 'Unnamed User'}
                    </span>
                    {isSelf && <Badge tone="neutral">You</Badge>}
                    <Badge tone={u.accountStatus === 'ACTIVE' ? 'success' : 'danger'}>
                      {u.accountStatus}
                    </Badge>
                    <Badge tone={u.role === 'SUPER_ADMIN' ? 'gold' : u.role === 'ADMIN' ? 'gold' : 'neutral'}>
                      {u.role}
                    </Badge>
                    {u.sellerStatus && (
                      <Badge tone={u.sellerStatus === 'APPROVED' ? 'success' : u.sellerStatus === 'PENDING' ? 'gold' : 'danger'}>
                        Seller: {u.sellerStatus}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                    <span>{u.email || 'No email associated'}</span>
                    <span>•</span>
                    <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-mono text-[10px] text-text-muted">{u.id}</span>
                  </div>
                </div>

                {/* Moderation Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {isSuperAdmin && !isSelf && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleOpenRoleDialog(u)}
                      disabled={setUserRole.isPending}
                    >
                      <Shield className="mr-1.5 h-3.5 w-3.5" />
                      Role
                    </Button>
                  )}

                  {canModerate && (
                    <>
                      {u.accountStatus === 'ACTIVE' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="border-danger/30 text-danger hover:bg-danger/10"
                          onClick={() => setSuspendDialog(u)}
                          disabled={moderateUser.isPending}
                        >
                          <UserX className="mr-1.5 h-3.5 w-3.5" />
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRestoreUser(u)}
                          disabled={moderateUser.isPending}
                        >
                          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                          Restore
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Suspend Confirmation Dialog */}
      <ModerationActionModal
        open={suspendDialog !== null}
        onClose={() => setSuspendDialog(null)}
        title={`Suspend user "${suspendDialog?.displayName || suspendDialog?.email || 'User'}"?`}
        description="Suspension reversibly restricts this account from making purchases, selling, or uploading artwork. A clear reason is required."
        requireReason={true}
        confirmLabel="Suspend User"
        isSubmitting={moderateUser.isPending}
        onConfirm={handleConfirmSuspend}
      />

      {/* Role Management Modal (Super Admin only) */}
      <Modal
        open={roleDialog !== null}
        onClose={() => setRoleDialog(null)}
        title={`Change Role: ${roleDialog?.displayName || roleDialog?.email || 'User'}`}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRoleDialog(null)} disabled={setUserRole.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRoleChange} disabled={setUserRole.isPending || selectedRole === roleDialog?.role}>
              {setUserRole.isPending ? 'Updating…' : 'Save Role'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Select a new application role for this user. Role assignments are privileged and logged in the audit ledger.
          </p>
          <div className="flex flex-col gap-2">
            {(['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as UserRole[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                  selectedRole === r
                    ? 'border-brand-primary bg-brand-primary/5 text-text-primary'
                    : 'border-border text-text-secondary hover:border-border-hover'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="user-role"
                    value={r}
                    checked={selectedRole === r}
                    onChange={() => setSelectedRole(r)}
                    className="accent-brand-primary"
                  />
                  <span className="text-sm font-medium">{r}</span>
                </div>
                {roleDialog?.role === r && <Badge tone="neutral">Current</Badge>}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}


import {
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'
import { createClient } from '@/lib/supabase/client'
import { Button, Card, PageHeader } from '@/shared/ui'

export function SecurityPage() {
  const { user } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updating, setUpdating] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState<{ success?: string; error?: string } | null>(null)

  const [resetSending, setResetSending] = useState(false)
  const [resetStatus, setResetStatus] = useState<string | null>(null)

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordStatus(null)

    if (newPassword.length < 8) {
      setPasswordStatus({ error: 'New password must be at least 8 characters long.' })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ error: 'Passwords do not match.' })
      return
    }

    setUpdating(true)
    try {
      const client = createClient()
      const { error } = await client.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      setPasswordStatus({ success: 'Password changed successfully!' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordStatus({
        error: err instanceof Error ? err.message : 'Failed to update password. Please try again.',
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleSendResetEmail = async () => {
    if (!user?.email) return
    setResetSending(true)
    setResetStatus(null)
    try {
      const client = createClient()
      const { error } = await client.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/recovery`,
      })
      if (error) throw error
      setResetStatus('A secure password reset link has been dispatched to your email address.')
    } catch (err) {
      setResetStatus(
        err instanceof Error ? err.message : 'Could not dispatch reset email. Please try again later.',
      )
    } finally {
      setResetSending(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/account" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Account
        </Link>
        <PageHeader
          title="Account Security"
          description="Manage credentials, authentication protections, and active account sessions."
        />
      </div>

      {/* Account Info Card */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-gold">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-text-primary">Identity & Protection</h3>
            <p className="text-xs text-text-muted">Signed in as {user?.email || 'Authenticated Collector'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-border text-xs">
          <div>
            <span className="text-text-muted">Account ID:</span>
            <p className="font-mono text-text-primary truncate">{user?.id || '—'}</p>
          </div>
          <div>
            <span className="text-text-muted">Authentication Provider:</span>
            <p className="text-text-primary">Supabase Auth (Encrypted Identity)</p>
          </div>
        </div>
      </Card>

      {/* Change Password Form */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <KeyRound aria-hidden="true" className="h-5 w-5 text-accent-gold" />
          <h3 className="font-medium text-sm text-text-primary">Change Password</h3>
        </div>

        {passwordStatus?.success && (
          <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            <span>{passwordStatus.success}</span>
          </div>
        )}

        {passwordStatus?.error && (
          <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {passwordStatus.error}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3.5 max-w-md">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-password" className="text-xs font-medium text-text-secondary">
              New Password
            </label>
            <div className="relative">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                id="new-password"
                type="password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-password" className="text-xs font-medium text-text-secondary">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                id="confirm-password"
                type="password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
              />
            </div>
          </div>

          <Button type="submit" variant="gold" size="md" disabled={updating} className="mt-1 self-start">
            {updating ? 'Updating Password…' : 'Update Password'}
          </Button>
        </form>
      </Card>

      {/* Password Reset Via Email */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <Mail aria-hidden="true" className="h-5 w-5 text-text-muted" />
          <h3 className="font-medium text-sm text-text-primary">Forgot or Reset via Email</h3>
        </div>
        <p className="text-xs text-text-secondary">
          Dispatch an automated one-time password reset recovery link to your registered inbox: {user?.email}.
        </p>

        {resetStatus && (
          <p className="rounded-lg bg-surface-elevated p-3 text-xs text-text-primary border border-border">
            {resetStatus}
          </p>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleSendResetEmail}
          disabled={resetSending}
          className="self-start text-xs"
        >
          {resetSending ? 'Sending Link…' : 'Send Reset Link to Email'}
        </Button>
      </Card>

      {/* Session Termination & Sign Out */}
      <Card className="flex flex-col gap-3 p-5 border-danger/30">
        <div className="flex items-center gap-2.5 text-danger">
          <LogOut aria-hidden="true" className="h-5 w-5" />
          <h3 className="font-medium text-sm">Session Termination</h3>
        </div>
        <p className="text-xs text-text-secondary">
          Securely invalidate your local session token and sign out across this browser instance.
        </p>

        <SignOutButton className="self-start rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/20 transition-colors">
          Sign out of ArtVault
        </SignOutButton>
      </Card>
    </section>
  )
}


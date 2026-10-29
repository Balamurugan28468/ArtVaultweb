import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/shared/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { authCallbackUrl, completeSupabaseReturn } from '@/features/auth/supabaseCompletion'
import { signInWithEmail } from '@/features/auth/api/authClient'
import { signInSchema } from '@/features/auth/schemas'

export function SupabaseAuthPage() {
  const [stage, setStage] = useState<'loading' | 'invalid' | 'password' | 'saved' | 'signed-out' | 'signed-in'>(() => window.location.pathname === '/auth/recovery' ? 'invalid' : 'loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [destination, setDestination] = useState('/account')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    if (window.location.pathname === '/auth/recovery') return
    void completeSupabaseReturn().then(result => {
      if (active) { setEmail(result.email); setDestination(result.destination); setStage('password') }
    }).catch(() => { if (active) setStage('invalid') })
    return () => { active = false }
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setNotice('')
    if (stage === 'password' && (password.length < 12 || password !== confirmation)) {
      setError('Use at least 12 characters and make both passwords match.'); return
    }
    setBusy(true)
    try {
      const client = createClient()
      if (stage === 'invalid') {
        const result = await client.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() })
        if (result.error) throw new Error('RECOVERY')
        setNotice('If this address is eligible for recovery, a new link will arrive by email. Open it in this browser.')
      } else if (stage === 'password') {
        const identity = await client.auth.getUser()
        if (identity.error || !identity.data.user) throw new Error('SESSION')
        const result = await client.auth.updateUser({ password })
        if (result.error) throw new Error('PASSWORD')
        setPassword(''); setConfirmation(''); setStage('saved')
      } else if (stage === 'signed-out') {
        const input = signInSchema.safeParse({ email, password })
        if (!input.success) { setError(input.error.issues[0]?.message ?? 'Enter your email and password.'); return }
        await signInWithEmail(input.data)
        setPassword(''); setStage('signed-in')
      }
    } catch (caught) {
      setError(stage === 'password' ? 'Password was not saved. Check the password policy or request a fresh link.'
        : stage === 'signed-out' ? caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.'
          : 'Unable to send a recovery link. Please retry or ask the project owner to check Auth email delivery.')
    } finally { setBusy(false) }
  }
  async function signOut() {
    setBusy(true); setError('')
    try {
      const result = await createClient().auth.signOut()
      if (result.error) throw new Error('SIGN_OUT')
      setStage('signed-out'); setEmail(''); setPassword(''); setConfirmation('')
    } catch { setError('Sign-out failed. Please retry.') }
    finally { setBusy(false) }
  }
  return <main className="mx-auto w-full max-w-md px-4 py-8 text-text-primary">
    <h1 className="font-display text-2xl">ArtVault account setup</h1>
    {stage === 'loading' && <p role="status">Checking your secure link…</p>}
    {stage === 'invalid' && <p className="my-4">No valid setup session is available. This link may be expired, already used, or opened in a different browser. Request a fresh recovery link below.</p>}
    {stage === 'password' && <p className="my-4 break-words">Set your password for {email}.</p>}
    {['invalid', 'password', 'signed-out'].includes(stage) && <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
      {stage !== 'password' && <label>Email<input className="mt-1 block w-full rounded border border-border-strong bg-surface-elevated p-3" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>}
      {stage !== 'invalid' && <label>{stage === 'password' ? 'New password' : 'Password'}<input className="mt-1 block w-full rounded border border-border-strong bg-surface-elevated p-3" type="password" autoComplete={stage === 'password' ? 'new-password' : 'current-password'} required minLength={stage === 'password' ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>}
      {stage === 'password' && <label>Confirm password<input className="mt-1 block w-full rounded border border-border-strong bg-surface-elevated p-3" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>}
      <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : stage === 'invalid' ? 'Send recovery link' : stage === 'password' ? 'Save password' : 'Sign in to Supabase'}</Button>
    </form>}
    {(stage === 'saved' || stage === 'signed-in') && <div className="my-4 space-y-4">
      <p role="status">{stage === 'saved' ? 'Password saved. Sign out and sign in below to verify it.' : 'Supabase sign-in succeeded.'}</p>
      <p className="break-words">Saved destination: {destination}. Application access requires your verified session and authorized ArtVault role.</p>
      <Button onClick={() => void signOut()} disabled={busy}>Sign out of Supabase</Button>
    </div>}
    {notice && <p role="status" className="mt-4">{notice}</p>}
    {error && <p role="alert" className="mt-4">{error}</p>}
  </main>
}

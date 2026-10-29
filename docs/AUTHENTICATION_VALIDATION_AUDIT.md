# Authentication validation audit — 20 October 2026

## Registration

Supabase Auth owns credentials and mailbox verification. A successful Send OTP
creates a pending Auth identity; the database trigger provisions its profile and
protected CUSTOMER role in that same transaction. This is not application-side
password storage. Profile and role primary keys/foreign keys enforce one row per
Auth UUID. Registration never inserts a browser-selected role.

Names accept international text, spaces and punctuation, trim surrounding spaces,
require 2–60 characters and reject control characters. Email validation checks
syntax and normalizes case/outer whitespace. The centralized high-confidence
Gmail typo list blocks **new registration** until corrected; it never edits input.
Other providers are supported. Existing identities under a typo domain can still
sign in with their exact registered address. Syntax is not proof a mailbox exists.

Passwords remain unchanged, require eight characters, uppercase, lowercase and a
number for signup, and must match confirmation exactly. Sign-in only requires a
nonempty password so existing passwords are not invalidated by new signup rules.

The one-page form always displays its six disabled OTP inputs before sending.
Successful sending enables them and starts a 60-second resend cooldown. Supabase
`verifyOtp` is authoritative. Eight-digit pastes are rejected, never truncated.
The owner confirmed **Email OTP length = 6** in the hosted Dashboard on this date;
the connected database tool cannot read that Auth-service setting. Keep that
setting and `EMAIL_OTP_LENGTH` aligned if the configuration changes.

Verified details are locked. Clearing React state is not a reversal of server-side
email confirmation. Final Create Account rechecks the verified UUID/email with
Auth, verifies the existing trigger-created profile, updates ordinary display-name
data, signs out the temporary session, and redirects to a blank sign-in form.
After a refresh or an unsuccessful finalization, the Auth identity may already be
confirmed: sign in with the originally registered email/password, or use Supabase
password recovery. Do not repeatedly create accounts to recover the UI step.

## Session isolation

OTP verification uses a separate Supabase client with a separate storage key,
`persistSession: false`, `autoRefreshToken: false`, and `detectSessionInUrl: false`.
It keeps the temporary session only in memory for finalization/profile RLS reads.
It cannot publish a SIGNED_IN event to the normal application client or leave a
verification session restored after reload. Abandonment/finalization clears it.
Normal explicit login still uses the existing persistent Supabase client.

The application does not persist passwords or OTPs in browser storage, route
state, URLs or public tables. Supabase's normal persistent session management is
unchanged; session credentials are managed by its SDK, not application profiles.

## Sign-in and account status

Credentials are checked exclusively by `supabase.auth.signInWithPassword`.
The profile is looked up by authenticated UUID, not email. A missing/incomplete
ordinary profile never becomes an invalid-credentials error. Protected account
status is read separately; SUSPENDED accounts are rejected and signed out locally.
Restored sessions also check status before protected routes/roles are exposed.
Status-read failures fail closed with a separate availability error. AuthProvider
diagnostics do not print raw error/session objects. Invalid credentials retain an
account-enumeration-safe message. Duplicate-signup errors use neutral sign-in/
recovery guidance rather than confirming whether the email has an account.

**Existing backend limitation found by this audit:** changing `profiles.status`
does not revoke already issued JWTs or uniformly gate existing RLS/RPC policies.
The deployed `private.has_role` and `current_app_role` functions consult role rows
without checking suspension. The UI login/restore checks do not replace a trusted
server-side ban/revocation and authorization audit. No existing Modules 1–5 SQL,
RLS or moderation operations were rewritten during this authentication change.
Do not describe application-level suspension checks as complete API-level
revocation. That backend boundary remains a separate security blocker to resolve
before production approval.

## Hosted read-only findings

The project audited was `fqxhjijxgdjfthmfokqk`. It had 7 Auth identities, 7 profiles,
7 protected role mappings, no missing profiles/roles and no orphaned profiles.
The `artvault_profile_created` trigger exists. Profiles have RLS enabled and
ownership policies; privileged role mappings are not ordinary browser writes.
The profile column list contains no password, password hash, OTP or session-token
column. No accounts, passwords, roles, SMTP settings or hosted schema were changed
by this audit. SMTP delivery and a complete real-mailbox flow require manual
retesting; automated frontend tests mock Auth/database boundaries.

## Files changed in this audit

Earlier uncommitted work remains in place. This audit changed only these files:

- `src/app/providers/AuthProvider.tsx`
- `src/app/providers/AuthProvider.test.tsx`
- `src/app/routes/SupabaseAuthPage.tsx`
- `src/app/routes/SupabaseAuthPage.test.tsx`
- `src/features/auth/validation.ts`
- `src/features/auth/validation.test.ts`
- `src/features/auth/schemas.ts`
- `src/features/auth/api/accountAccess.ts`
- `src/features/auth/api/accountAccess.test.ts`
- `src/features/auth/api/authClient.ts`
- `src/features/auth/api/authClient.test.ts`
- `src/features/auth/api/authErrors.ts`
- `src/features/auth/api/authErrors.test.ts`
- `src/features/auth/api/ensureUserProfile.ts`
- `src/features/auth/components/SignUpForm.tsx`
- `src/features/auth/components/SignUpForm.test.tsx`
- `src/features/auth/components/SignInForm.tsx`
- `src/features/auth/components/VerifyOtpForm.tsx`
- `src/features/auth/components/VerifyOtpForm.test.tsx`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/client.test.ts`
- `docs/AUTHENTICATION_VALIDATION_AUDIT.md`

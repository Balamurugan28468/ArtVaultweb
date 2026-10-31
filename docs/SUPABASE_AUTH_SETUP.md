# Local Supabase invitations and password recovery

The local app runs at http://localhost:5173. In Supabase Dashboard for project
fqxhjijxgdjfthmfokqk, open Authentication > URL Configuration:

- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173/auth/callback`
- Also allow `http://localhost:5173/auth/callback?next=**` if callers supply a
  destination query. This wildcard is confined to this development callback.

Callback route: `/auth/callback`. Recovery request page: `/auth/recovery`.
Application recovery requests explicitly use the callback URL. Dashboard
invitations that return to Site URL `/` with Auth credentials are routed to the
callback before Firebase providers mount. Keep standard Supabase ConfirmationURL
email links; custom hardcoded localhost:3000 templates must be corrected.
Existing used/expired email links cannot be repaired by changing Site URL.
Send a fresh invitation/recovery link after configuration changes.

The callback consumes implicit token pairs or a PKCE code once, verifies the user
with Supabase Auth, and removes credentials/errors from the address bar. PKCE
requires the browser holding the verifier. It rejects incomplete/error callbacks
without falling back to an unrelated existing session. Only safe local `next`
destinations are retained in sessionStorage; roles are never set in metadata.
Password setup uses updateUser({password}) and requires a verified Auth session.
The page supports sign-out and password sign-in to verify account completion.
No privileged key is used. Firebase providers are excluded from these routes.

The main application remains Firebase-backed during this checkpoint. The setup
page states this explicitly; it preserves the intended destination but does not
pretend a Supabase session authorizes the legacy application. Migration must
remain paused until hosted invitation/password completion is verified.

## Owner hosted test

1. Run the existing Vite server on 5173; do not start a duplicate process.
2. Correct Dashboard URLs and obtain a fresh email link. Open it on the same
   computer/browser used for recovery requests. Never paste the link/token here.
3. Verify the callback shows the intended email and removes token/code fragments.
4. Set a matching password of at least 12 characters (also subject to the hosted
   password policy). Verify the successful save message.
5. Sign out using this page, then sign in with that email and password. Verify
   the Supabase sign-in success message. Refresh to confirm session restoration.
6. Test an expired/used link: it must show recovery UI without granting a session
   from that link. Request a fresh recovery email and repeat.
7. Test both separate owner-approved identities. Protected roles are assigned
   independently with trusted SQL; password completion never changes roles.

Default Supabase email delivery may restrict recipients to project team members.
Configure custom SMTP in Dashboard if needed; keep provider secrets there.
Automated mocked component tests do not prove hosted email delivery, acceptance,
password change or subsequent login. Those results must be reported separately.

## Verification at this checkpoint

37 targeted client/callback/component/router tests passed. Typecheck, lint and
production build passed (existing warnings remain). Both routes returned HTTP
200 from the running Vite server. The first headless Chrome attempt timed out;
a subsequent direct callback check rendered the expired-link recovery page,
removed the fragment, reported no JS exceptions or Firebase emulator requests,
and had no horizontal overflow at 302, 320, 350x515, 390, 768, 1024 and 1440px.
Hosted catalog checks find both approved identities with confirmation timestamps
and password fields present. No hosted passwords or email tokens were accessed;
successful invite acceptance/password update/login is NOT yet proven.

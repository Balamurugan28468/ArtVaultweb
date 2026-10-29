import { createClient, createRegistrationClient } from '@/lib/supabase/client'
import { getAccountStatus } from './accountAccess'
import { EMAIL_OTP_LENGTH } from '../validation'
import { signUpSchema, type SignInInput, type SignUpInput } from '../schemas'
import type { AuthUser } from '../types'
import { toAuthErrorMessage } from './authErrors'
import { mapSupabaseUser } from './userMapper'

export interface SignUpResult {
  user: AuthUser
  needsEmailConfirmation: boolean
}

export interface SignUpWithEmailInput {
  email: string
  password: string
  displayName: string
}

/**
 * Register a new user using Supabase Auth.
 *
 * The account is created in auth.users.
 *
 * The existing Supabase auth trigger is responsible for provisioning
 * public.profiles and the default CUSTOMER role.
 */
export async function signUpWithEmail(
  input: SignUpWithEmailInput,
): Promise<SignUpResult> {
  const supabase = createRegistrationClient()

  try {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,

      options: {
        data: {
          display_name: input.displayName.trim(),
        },
      },
    })

    if (error) {
      throw error
    }

    if (!data.user) {
      throw new Error('Supabase did not return a user after registration.')
    }

    if (data.session) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      throw { code: 'email_confirmation_disabled' }
    }
    if (data.user.email_confirmed_at || data.user.identities?.length === 0) {
      throw { code: 'user_already_exists' }
    }

    return {
      user: mapSupabaseUser(data.user),

      // When email confirmation is enabled Supabase returns a user but
      // normally does not create the authenticated session until the
      // email OTP is verified.
      needsEmailConfirmation: !data.session,
    }
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

/**
 * Sign in using Supabase email/password authentication.
 */
export async function signInWithEmail(
  input: SignInInput,
): Promise<AuthUser> {
  const supabase = createClient()

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    })

    if (error) {
      throw error
    }

    if (!data.user) {
      throw new Error('Supabase did not return a user after sign in.')
    }

    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut({ scope: 'local' })
      throw { code: 'email_not_confirmed' }
    }
    try {
      if (await getAccountStatus(data.user.id) === 'SUSPENDED') throw { code: 'user_banned' }
    } catch (accessError) {
      await supabase.auth.signOut({ scope: 'local' })
      if (accessError instanceof Error) throw { code: 'account_status_unavailable' }
      throw accessError
    }

    return mapSupabaseUser(data.user)
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

/**
 * Sign out the currently authenticated Supabase user.
 */
export async function signOutUser(): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

export async function signOutRegistrationSession(): Promise<void> {
  const { error } = await createRegistrationClient().auth.signOut({ scope: 'local' })
  if (error) throw new Error(toAuthErrorMessage(error))
}

/**
 * Sends a Supabase password-recovery email.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = createClient()

  const redirectTo = `${window.location.origin}/auth/callback?next=/auth/recovery`

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  })

  if (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

export interface VerifyEmailOtpInput {
  email: string
  token: string
}

export interface VerifyEmailOtpResult {
  user: AuthUser
}

/**
 * Verify a signup OTP code using Supabase Auth.
 *
 * Confirms the user's email address and ensures their profile is ready,
 * then explicitly signs out any session created by the verification API
 * so the user must sign in explicitly via email + password as requested.
 */
export async function verifyEmailOtp(
  input: VerifyEmailOtpInput,
  options?: { retainSession?: boolean },
): Promise<VerifyEmailOtpResult> {
  const supabase = createRegistrationClient()

  try {
    if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(input.token.trim())) {
      throw { code: 'otp_invalid' }
    }
    const { data, error } = await supabase.auth.verifyOtp({
      email: input.email.trim(),
      token: input.token.trim(),
      type: 'signup',
    })

    if (error) {
      throw error
    }

    if (!data.user) {
      throw new Error('Supabase did not return a verified user.')
    }

    const mapped = mapSupabaseUser(data.user)

    // Read the trigger-provisioned profile; never create a client-owned role.
    // Always sign out, including when provisioning verification fails.
    let retainSession = false
    try {
      if (!mapped.emailVerified) throw { code: 'email_not_confirmed' }
      const { ensureUserProfile } = await import('./ensureUserProfile')
      await ensureUserProfile(mapped, undefined, supabase)
      retainSession = options?.retainSession === true
    } finally {
      if (!retainSession) await signOutRegistrationSession()
    }

    return { user: mapped }
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

/**
 * Resends a signup verification OTP to the user's email address.
 */
export async function resendVerificationOtp(email: string): Promise<void> {
  const supabase = createRegistrationClient()

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    })

    if (error) {
      throw error
    }
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

/** Finalize only the verified identity; credentials remain exclusively in Auth. */
export async function completeSignUp(input: SignUpInput & { userId: string }): Promise<void> {
  const supabase = createRegistrationClient()
  try {
    const values = signUpSchema.parse(input)
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    const user = data.user
    if (!user?.email_confirmed_at || user.id !== input.userId || user.email?.toLowerCase() !== values.email.toLowerCase()) {
      throw { code: 'registration_session_mismatch' }
    }
    const { ensureUserProfile } = await import('./ensureUserProfile')
    await ensureUserProfile({ id: user.id }, undefined, supabase)
    // A repeated signup of a pending identity must end with the password the
    // user currently chose. Never write it (or the OTP) to public tables.
    const { error: updateError } = await supabase.auth.updateUser({
      password: values.password,
      data: { display_name: values.displayName },
    })
    if (updateError?.code === 'same_password') {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { display_name: values.displayName } })
      if (metadataError) throw metadataError
    } else if (updateError) throw updateError
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .update({ display_name: values.displayName }).eq('id', user.id).select('id').maybeSingle()
    if (profileError) throw profileError
    if (profile?.id !== user.id) throw { code: 'registration_profile_missing' }
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  } finally {
    await signOutRegistrationSession()
  }
}

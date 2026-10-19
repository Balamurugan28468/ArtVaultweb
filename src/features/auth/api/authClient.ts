import { createClient } from '@/lib/supabase/client'
import type { SignInInput } from '../schemas'
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
  const supabase = createClient()

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

    return {
      user: mapSupabaseUser(data.user),

      // When email confirmation is enabled Supabase returns a user but
      // normally does not create the authenticated session until the
      // confirmation link is completed.
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
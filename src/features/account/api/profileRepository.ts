import { createClient } from '@/lib/supabase/client'
import { getCurrentRoleClaim } from '@/features/auth/api/roleClaim'
import { isUserRole, type UserProfile } from '@/features/auth/types'
import type { AccountError, UpdateUserProfileInput } from '../types'

function getErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error
  ) {
    return String(error.code)
  }

  return ''
}

export function toAccountError(
  error: unknown,
): AccountError {
  const code = getErrorCode(error)

  if (
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'permission-denied'
  ) {
    return {
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    }
  }

  if (
    error instanceof TypeError ||
    code === '57014' ||
    code === 'network' ||
    code === 'unavailable'
  ) {
    return {
      code: 'network',
      message:
        'Network unavailable. Check your connection and try again.',
    }
  }

  if (
    code === 'PGRST116' ||
    code === 'not-found'
  ) {
    return {
      code: 'not-found',
      message: 'Profile not found.',
    }
  }

  return {
    code: 'unknown',
    message: 'Something went wrong. Please try again.',
  }
}

function toIsoTimestamp(
  value: unknown,
): string {
  if (typeof value === 'string') {
    const date = new Date(value)

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return new Date().toISOString()
}

function optionalString(
  value: unknown,
): string | null {
  return typeof value === 'string'
    ? value
    : null
}

async function getAuthenticatedUser(
  expectedUid: string,
) {
  const supabase = createClient()

  const {
    data,
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!data.user) {
    throw {
      code: 'permission-denied',
    }
  }

  if (data.user.id !== expectedUid) {
    throw {
      code: 'permission-denied',
    }
  }

  return data.user
}

async function mapToProfile(
  uid: string,
  data: Record<string, unknown>,
): Promise<UserProfile> {
  const authUser =
    await getAuthenticatedUser(uid)

  const resolvedRole =
    await getCurrentRoleClaim()

  const role =
    isUserRole(resolvedRole)
      ? resolvedRole
      : 'CUSTOMER'

  const metadata =
    authUser.user_metadata ?? {}

  const metadataPhotoURL =
    typeof metadata.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata.photo_url === 'string'
        ? metadata.photo_url
        : null

  return {
    id: uid,
    uid,

    email:
      authUser.email ?? null,

    displayName:
      optionalString(data.display_name),

    phoneNumber:
      optionalString(data.phone),

    bio:
      optionalString(data.bio),

    photoPath:
      optionalString(data.photo_path),

    photoURL:
      metadataPhotoURL,

    role,

    profileCompleted:
      data.profile_completed === true,

    createdAt:
      toIsoTimestamp(
        data.created_at,
      ),

    updatedAt:
      toIsoTimestamp(
        data.updated_at,
      ),
  }
}

export async function getUserProfile(
  uid: string,
): Promise<UserProfile | null> {
  try {
    await getAuthenticatedUser(uid)

    const supabase =
      createClient()

    const {
      data,
      error,
    } = await supabase
      .from('profiles')
      .select(
        `
          id,
          display_name,
          phone,
          bio,
          photo_path,
          profile_completed,
          created_at,
          updated_at
        `,
      )
      .eq(
        'id',
        uid,
      )
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return null
    }

    return await mapToProfile(
      uid,
      data as Record<string, unknown>,
    )
  } catch (error) {
    throw toAccountError(error)
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (
    profile: UserProfile | null,
  ) => void,
  onError: (
    error: AccountError,
  ) => void,
): () => void {
  const supabase =
    createClient()

  let active = true
  let generation = 0

  const refresh = async () => {
    const currentGeneration =
      ++generation

    try {
      const profile =
        await getUserProfile(uid)

      if (
        active &&
        currentGeneration === generation
      ) {
        onData(profile)
      }
    } catch (error) {
      if (
        active &&
        currentGeneration === generation
      ) {
        onError(
          toAccountError(error),
        )
      }
    }
  }

  const channel =
    supabase
      .channel(
        `profile:${uid}`,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${uid}`,
        },
        () => {
          void refresh()
        },
      )
      .subscribe(
        (status) => {
          if (
            status ===
            'SUBSCRIBED'
          ) {
            void refresh()
          }

          if (
            status ===
              'CHANNEL_ERROR' ||
            status ===
              'TIMED_OUT'
          ) {
            onError({
              code: 'network',
              message:
                'Network unavailable. Check your connection and try again.',
            })
          }
        },
      )

  void refresh()

  const handleFocus = () => {
    void refresh()
  }

  window.addEventListener(
    'focus',
    handleFocus,
  )

  return () => {
    active = false
    generation += 1

    window.removeEventListener(
      'focus',
      handleFocus,
    )

    void supabase.removeChannel(
      channel,
    )
  }
}

function deterministicProfileCompleted(
  input: UpdateUserProfileInput,
): boolean {
  return Boolean(
    input.displayName.trim(),
  ) &&
    Boolean(
      input.bio?.trim(),
    ) &&
    Boolean(
      input.phoneNumber?.trim(),
    )
}

export async function updateUserProfile(
  uid: string,
  input: UpdateUserProfileInput,
): Promise<void> {
  try {
    await getAuthenticatedUser(uid)

    const supabase =
      createClient()

    const {
      data,
      error,
    } = await supabase
      .from('profiles')
      .update({
        display_name:
          input.displayName.trim(),

        phone:
          input.phoneNumber?.trim() ||
          null,

        bio:
          input.bio?.trim() ||
          null,

        profile_completed:
          deterministicProfileCompleted(
            input,
          ),

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        uid,
      )
      .select('id')
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      throw {
        code: 'not-found',
      }
    }
  } catch (error) {
    throw toAccountError(error)
  }
}
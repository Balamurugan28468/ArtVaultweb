import { createClient } from './client'

export function dataError(
  error: unknown,
) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error
      ? String(error.code)
      : ''

  if (
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'permission-denied'
  ) {
    return {
      code:
        'permission-denied' as const,
      message:
        'You do not have permission to do that.',
    }
  }

  if (
    error instanceof TypeError ||
    code === '57014' ||
    code === 'network'
  ) {
    return {
      code: 'network' as const,
      message:
        'Network unavailable. Check your connection and try again.',
    }
  }

  if (
    code === '22023' &&
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message ===
      'string'
  ) {
    return {
      code: 'unknown' as const,
      message: error.message,
    }
  }

  return {
    code: 'unknown' as const,
    message:
      'Something went wrong. Please try again.',
  }
}

export async function result<T>(
  request: PromiseLike<{
    data: T
    error: unknown
  }>,
): Promise<T> {
  const {
    data,
    error,
  } = await request

  if (error) {
    throw dataError(error)
  }

  return data
}

export async function rpc<
  T = void,
>(
  name: string,
  args: Record<
    string,
    unknown
  > = {},
): Promise<T> {
  return (await result(
    createClient().rpc(
      name,
      args,
    ),
  )) as T
}

/**
 * Re-query through RLS whenever the underlying PostgreSQL
 * table changes. Raw realtime payloads are deliberately not
 * trusted as application state.
 */
export function observe<T>(
  table: string,
  filter: string | undefined,
  read: () => Promise<T>,
  onData: (
    value: T,
  ) => void,
  onError: (
    error: ReturnType<
      typeof dataError
    >,
  ) => void,
) {
  let active = true
  let version = 0

  const refresh = () => {
    const token =
      ++version

    void read().then(
      (value) => {
        if (
          active &&
          token === version
        ) {
          onData(value)
        }
      },
      (error) => {
        if (
          active &&
          token === version
        ) {
          onError(
            dataError(error),
          )
        }
      },
    )
  }

  const client =
    createClient()

  const channel = client
    .channel(
      `artvault:${table}:${crypto.randomUUID()}`,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter
          ? { filter }
          : {}),
      },
      refresh,
    )
    .subscribe(
      (status) => {
        if (!active) {
          return
        }

        if (
          status ===
          'SUBSCRIBED'
        ) {
          refresh()
          return
        }

        if (
          status ===
            'CHANNEL_ERROR' ||
          status ===
            'TIMED_OUT'
        ) {
          onError(
            dataError(
              new TypeError(
                'Realtime unavailable',
              ),
            ),
          )
        }
      },
    )

  refresh()

  window.addEventListener(
    'focus',
    refresh,
  )

  return () => {
    active = false
    version += 1

    window.removeEventListener(
      'focus',
      refresh,
    )

    void client.removeChannel(
      channel,
    )
  }
}

export async function requireIdentity(
  uid: string,
): Promise<void> {
  const {
    data,
    error,
  } =
    await createClient()
      .auth.getUser()

  if (
    error ||
    data.user?.id !== uid
  ) {
    throw dataError({
      code: '42501',
    })
  }
}

export async function signedImage(
  path: string,
): Promise<string> {
  const data =
    await result(
      createClient()
        .storage
        .from(
          'artwork-images',
        )
        .createSignedUrl(
          path,
          300,
        ),
    )

  if (
    !data?.signedUrl
  ) {
    throw dataError(null)
  }

  return data.signedUrl
}

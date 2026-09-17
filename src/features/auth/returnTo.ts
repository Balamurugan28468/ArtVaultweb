/** Preserve only local application destinations. */
export function getRedirectPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return '/account'
  const from = state.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || /[\\\s]/.test(from)) return '/account'
  try {
    const url = new URL(from, 'https://artvault.invalid')
    if (url.origin !== 'https://artvault.invalid' || ['/sign-in', '/sign-up'].includes(url.pathname)) return '/account'
    return url.pathname + url.search + url.hash
  } catch {
    return '/account'
  }
}

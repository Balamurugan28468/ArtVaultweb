import { getIdTokenResult, type User } from 'firebase/auth'
import { isUserRole, type UserRole } from '../types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getCurrentRoleClaim(user: User, forceRefresh = false): Promise<UserRole | null> {
  const tokenResult = await getIdTokenResult(user, forceRefresh)
  const role = tokenResult.claims.role
  return isUserRole(role) ? role : null
}

/**
 * The role custom claim is set by a Cloud Function that runs asynchronously
 * after sign-up, so it is not guaranteed to be present on the very first
 * token read. Polls with forced token refreshes until it appears or the
 * retry budget is exhausted. The default budget (~6s) is sized for a cold
 * Cloud Functions start (confirmed empirically against the local emulator —
 * a tighter ~2s budget was observed to expire before the trigger completed).
 */
export async function waitForRoleClaim(
  user: User,
  { retries = 12, delayMs = 500 }: { retries?: number; delayMs?: number } = {},
): Promise<UserRole | null> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const role = await getCurrentRoleClaim(user, attempt > 0)
    if (role) return role
    if (attempt < retries) await sleep(delayMs)
  }
  return null
}

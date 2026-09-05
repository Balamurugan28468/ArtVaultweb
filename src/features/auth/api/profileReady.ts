import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

/**
 * The users/{uid} Firestore document is created by the onUserCreate Cloud
 * Function trigger (Admin SDK) as an asynchronous, out-of-band write — it is
 * not guaranteed to exist yet the moment sign-up's own client-side calls
 * resolve. Rather than guessing how long that takes (a fixed delay) or
 * inferring it indirectly from an unrelated signal (the custom-claim token
 * refresh happens to usually — not always — land after it), this waits on
 * the actual precondition via a live listener, resolving the instant
 * Firestore reports the document exists. `timeoutMs` is a safety net against
 * a genuinely broken trigger (e.g. Cloud Functions not running), not the
 * synchronization mechanism itself — it rejects rather than resolving, so a
 * real failure surfaces instead of being silently treated as success.
 */
export function waitForUserProfileDocument(uid: string, { timeoutMs = 15000 }: { timeoutMs?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let unsubscribe: Unsubscribe = () => {}

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      unsubscribe()
      console.error('waitForUserProfileDocument: timed out waiting for users/{uid} to be created:', uid)
      reject(new Error('Timed out waiting for the account profile to be created.'))
    }, timeoutMs)

    unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snapshot) => {
        if (settled || !snapshot.exists()) return
        settled = true
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        unsubscribe()
        console.error('waitForUserProfileDocument: listener error:', error)
        reject(error instanceof Error ? error : new Error('Failed to read the account profile.'))
      },
    )
  })
}

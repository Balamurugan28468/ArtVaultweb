/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint. This is the only way ADMIN/SUPER_ADMIN is
 * ever granted; there is deliberately no self-service or in-app path to
 * either role.
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run set-admin-claim -- <uid> ADMIN
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run set-admin-claim -- <uid> SUPER_ADMIN
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const PRIVILEGED_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const
type PrivilegedRole = (typeof PRIVILEGED_ROLES)[number]

function isPrivilegedRole(value: string | undefined): value is PrivilegedRole {
  return value !== undefined && (PRIVILEGED_ROLES as readonly string[]).includes(value)
}

async function main(): Promise<void> {
  const [, , uid, role] = process.argv

  if (!uid || !isPrivilegedRole(role)) {
    console.error('Usage: npm run set-admin-claim -- <uid> <ADMIN|SUPER_ADMIN>')
    process.exitCode = 1
    return
  }

  initializeApp()
  await getAuth().setCustomUserClaims(uid, { role })
  console.log(`Set role=${role} for uid=${uid}`)
}

void main()

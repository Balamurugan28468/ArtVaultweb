import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const DEFAULT_OWNER_UID = 'ppqIaap00MbYNY9RGDQmTwBb54bP'

interface OwnerSummary {
  uid: string
  authFound: boolean
  email: string | null
  authRole: string | null
  usersRole: string | null
  sellerStatus: string | null
  artworkCount: number
}

interface StateSummary {
  authUsers: number
  users: number
  sellers: number
  artworks: number
  approvedSellers: number
  approvedWithSellerClaim: number
  approvedMissingSellerClaim: string[]
  snapshotGeneration: string | null
  owner: OwnerSummary | null
}

// Run from `functions/` (see package.json's "verify:emulator-state" script),
// so the canonical snapshot manifest this project-root launcher writes
// (scripts/start-emulators.mjs) lives one directory up. Read-only — this
// never writes to that file.
function readSnapshotGeneration(): string | null {
  const manifestPath = path.join(process.cwd(), '..', 'emulator-data', 'artvault-snapshot-manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { generation?: string }
    return manifest.generation ?? null
  } catch {
    return null
  }
}

/** `ownerUid` is optional — omit it to get the aggregate invariant checks only. */
export async function readEmulatorState(ownerUid?: string): Promise<StateSummary> {
  const authUsers = (await getAuth().listUsers()).users
  const users = await getFirestore().collection('users').get()
  const sellers = await getFirestore().collection('sellers').get()
  const artworks = await getFirestore().collection('artworks').get()
  const approved = sellers.docs.filter((doc) => doc.data().status === 'APPROVED')
  let approvedWithSellerClaim = 0
  const approvedMissingSellerClaim: string[] = []

  for (const seller of approved) {
    const user = authUsers.find((candidate) => candidate.uid === seller.id)
    if ((user?.customClaims as { role?: string } | undefined)?.role === 'SELLER') {
      approvedWithSellerClaim += 1
    } else {
      approvedMissingSellerClaim.push(seller.id)
    }
  }

  let owner: OwnerSummary | null = null
  if (ownerUid) {
    const ownerAuth = authUsers.find((candidate) => candidate.uid === ownerUid) ?? null
    const ownerUsersDoc = users.docs.find((doc) => doc.id === ownerUid)
    const ownerSellerDoc = sellers.docs.find((doc) => doc.id === ownerUid)
    const ownerArtworkCount = artworks.docs.filter((doc) => doc.data().sellerId === ownerUid).length

    owner = {
      uid: ownerUid,
      authFound: !!ownerAuth,
      email: ownerAuth?.email ?? null,
      authRole: (ownerAuth?.customClaims as { role?: string } | undefined)?.role ?? null,
      usersRole: (ownerUsersDoc?.data().role as string | undefined) ?? null,
      sellerStatus: (ownerSellerDoc?.data().status as string | undefined) ?? null,
      artworkCount: ownerArtworkCount,
    }
  }

  return {
    authUsers: authUsers.length,
    users: users.size,
    sellers: sellers.size,
    artworks: artworks.size,
    approvedSellers: approved.length,
    approvedWithSellerClaim,
    approvedMissingSellerClaim,
    snapshotGeneration: readSnapshotGeneration(),
    owner,
  }
}

async function main(): Promise<void> {
  const [, , uidArg] = process.argv
  const ownerUid = uidArg ?? DEFAULT_OWNER_UID

  initializeApp()
  const summary = await readEmulatorState(ownerUid)
  console.log(`Auth users: ${summary.authUsers}`)
  console.log(`Firestore users: ${summary.users}`)
  console.log(`Seller applications: ${summary.sellers}`)
  console.log(`Artworks: ${summary.artworks}`)
  console.log(`Approved sellers: ${summary.approvedSellers}`)
  console.log(
    `Approved sellers with SELLER Auth claims: ${summary.approvedWithSellerClaim}/${summary.approvedSellers}`,
  )
  for (const uid of summary.approvedMissingSellerClaim) {
    console.log(`Mismatch: approved seller ${uid} is missing a SELLER Auth claim`)
  }
  console.log(`Snapshot generation: ${summary.snapshotGeneration ?? '(no manifest recorded)'}`)

  if (summary.owner) {
    const o = summary.owner
    console.log(`--- Owner (${o.uid}) ---`)
    console.log(`Auth account found: ${o.authFound}`)
    console.log(`Email: ${o.email ?? '(none)'}`)
    console.log(`Auth role claim: ${o.authRole ?? '(none)'}`)
    console.log(`users/{uid}.role: ${o.usersRole ?? '(no profile document)'}`)
    console.log(`sellers/{uid}.status: ${o.sellerStatus ?? '(no seller application)'}`)
    console.log(`Owner artwork count: ${o.artworkCount}`)
  }

  if (summary.approvedWithSellerClaim !== summary.approvedSellers) {
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}

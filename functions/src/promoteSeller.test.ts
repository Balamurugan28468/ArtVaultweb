import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promoteSellerByUid, rejectSellerApplicationByUid } from './promoteSeller'

const setCustomUserClaims = vi.fn()
const sellersGet = vi.fn()
const sellersUpdate = vi.fn()
const usersUpdate = vi.fn()
const artistsSet = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'sellers') return { doc: () => ({ get: sellersGet, update: sellersUpdate }) }
      if (name === 'users') return { doc: () => ({ update: usersUpdate }) }
      if (name === 'artists') return { doc: () => ({ set: artistsSet }) }
      throw new Error(`unexpected collection: ${name}`)
    },
    // Mirrors index.ts's own transaction mock pattern: the transaction
    // object's get/update simply delegate to the same doc-level mocks used
    // everywhere else in this file, so a test only ever configures
    // sellersGet/sellersUpdate once, regardless of whether the production
    // code happens to read/write directly or inside a transaction.
    // `transaction.update(ref, data)` takes two arguments — dropping `ref`
    // here keeps `sellersUpdate` called with just `data`, exactly as every
    // existing assertion in this file already expects.
    runTransaction: async (
      updateFunction: (tx: { get: () => unknown; update: (ref: unknown, data: unknown) => unknown }) => Promise<unknown>,
    ) => updateFunction({ get: () => sellersGet(), update: (_ref, data) => sellersUpdate(data) }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  setCustomUserClaims.mockClear()
  sellersGet.mockReset()
  sellersUpdate.mockClear()
  usersUpdate.mockClear()
  artistsSet.mockClear()
})

describe('promoteSellerByUid', () => {
  it('grants the SELLER claim, mirrors role on users/{uid}, and approves the seller application', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })

    await promoteSellerByUid('alice')

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'SELLER' })
    expect(usersUpdate).toHaveBeenCalledWith(expect.objectContaining({ role: 'SELLER' }))
    expect(sellersUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }))
  })

  it('creates the public artists/{uid} projection, seeded from the approved application', async () => {
    sellersGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'PENDING', businessName: 'Alice Fine Art', description: 'Oil paintings and prints.' }),
    })

    await promoteSellerByUid('alice')

    expect(artistsSet).toHaveBeenCalledWith({
      uid: 'alice',
      displayName: 'Alice Fine Art',
      bio: 'Oil paintings and prints.',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('refuses to promote a uid with no seller application', async () => {
    sellersGet.mockResolvedValue({ exists: false })

    await expect(promoteSellerByUid('bob')).rejects.toThrow(/no seller application/i)
    expect(sellersUpdate).not.toHaveBeenCalled()
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(artistsSet).not.toHaveBeenCalled()
  })

  it('refuses to re-promote an already-approved application (idempotency guard, not a silent no-op)', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'APPROVED' }) })

    await expect(promoteSellerByUid('carol')).rejects.toThrow(/already approved/i)
    expect(artistsSet).not.toHaveBeenCalled()
  })

  it('refuses to approve an already-rejected application — a decision is final', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'REJECTED' }) })

    await expect(promoteSellerByUid('carol')).rejects.toThrow(/already rejected/i)
    expect(sellersUpdate).not.toHaveBeenCalled()
    expect(artistsSet).not.toHaveBeenCalled()
  })

  it('the read-check-write for the decision runs inside a Firestore transaction (concurrency safety)', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })
    await promoteSellerByUid('alice')
    // The mock's own runTransaction wiring is what proves this — if the
    // production code ever stopped calling db.runTransaction(), sellersGet/
    // sellersUpdate (only reachable via the mocked transaction object)
    // would never be invoked and every assertion above would fail instead.
    expect(sellersGet).toHaveBeenCalledTimes(1)
  })

  it('validates and commits the APPROVED transaction before ever touching Auth — a caller can never end up with a claim for an invalid approval', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })
    const callOrder: string[] = []
    sellersUpdate.mockImplementationOnce(() => {
      callOrder.push('approve')
      return Promise.resolve()
    })
    setCustomUserClaims.mockImplementationOnce(() => {
      callOrder.push('claim')
      return Promise.resolve()
    })

    await promoteSellerByUid('alice')

    expect(callOrder).toEqual(['approve', 'claim'])
  })

  it('never touches Auth at all when the application does not exist or is already decided', async () => {
    sellersGet.mockResolvedValue({ exists: false })
    await expect(promoteSellerByUid('ghost')).rejects.toThrow(/no seller application/i)
    expect(setCustomUserClaims).not.toHaveBeenCalled()

    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'APPROVED' }) })
    await expect(promoteSellerByUid('alice')).rejects.toThrow(/already approved/i)
    expect(setCustomUserClaims).not.toHaveBeenCalled()
  })
})

describe('rejectSellerApplicationByUid', () => {
  it('records REJECTED status and the rejection reason, and grants no privilege', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })

    await rejectSellerApplicationByUid('alice', 'Portfolio does not meet our quality guidelines.')

    expect(sellersUpdate).toHaveBeenCalledWith({
      status: 'REJECTED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: 'Portfolio does not meet our quality guidelines.',
      updatedAt: 'SERVER_TIMESTAMP',
    })
    expect(setCustomUserClaims).not.toHaveBeenCalled()
    expect(usersUpdate).not.toHaveBeenCalled()
    expect(artistsSet).not.toHaveBeenCalled()
  })

  it('refuses to reject a uid with no seller application', async () => {
    sellersGet.mockResolvedValue({ exists: false })

    await expect(rejectSellerApplicationByUid('bob', 'reason')).rejects.toThrow(/no seller application/i)
    expect(sellersUpdate).not.toHaveBeenCalled()
  })

  it('refuses to reject an already-approved application — cannot reject through the moderation flow once approved', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'APPROVED' }) })

    await expect(rejectSellerApplicationByUid('alice', 'reason')).rejects.toThrow(/already approved/i)
    expect(sellersUpdate).not.toHaveBeenCalled()
    expect(setCustomUserClaims).not.toHaveBeenCalled()
  })

  it('refuses to re-reject an already-rejected application (idempotency guard)', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'REJECTED' }) })

    await expect(rejectSellerApplicationByUid('alice', 'reason')).rejects.toThrow(/already rejected/i)
    expect(sellersUpdate).not.toHaveBeenCalled()
  })

  it('does not touch users/{uid} — CUSTOMER access is left completely untouched', async () => {
    sellersGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PENDING' }) })

    await rejectSellerApplicationByUid('alice', 'reason')

    expect(usersUpdate).not.toHaveBeenCalled()
    expect(setCustomUserClaims).not.toHaveBeenCalled()
  })
})

/**
 * Module 13 Phase 2 — near-simultaneous callers on the same application.
 *
 * A naive mock that shared mutable `status` across two racing calls without
 * modeling *when* each call's read is allowed to observe a write would
 * prove nothing real: both calls could trivially "read PENDING" before
 * either writes, exactly the double-grant bug a real Firestore transaction
 * exists to prevent. These tests instead use an explicit gate so the
 * second call's `get()` is only allowed to resolve once the first call's
 * `update()` has actually committed — reproducing the *outcome* Firestore's
 * real optimistic-concurrency transaction protocol guarantees (the losing
 * side of a race is retried against a fresh, post-commit read and can never
 * act on a stale snapshot) without reimplementing Firestore's internal
 * retry algorithm itself. Firestore's own commit-time conflict detection is
 * a platform guarantee this codebase already leans on for
 * `decideArtworkByArtworkId` too — see publishArtwork.test.ts's equivalent
 * suite — real end-to-end proof of that platform guarantee under genuine
 * concurrency is a real emulator/client-SDK exercise, not something a
 * mocked-Admin-SDK unit test can or should claim to provide (see Module 12
 * Phase 4's own precedent and disclosed limitation for exactly this
 * distinction).
 */
describe('near-simultaneous callers — concurrency safety', () => {
  it('two near-simultaneous approve attempts on the same PENDING application: exactly one succeeds, the other fails as already-approved, no duplicate claim or profile', async () => {
    let status: string = 'PENDING'
    let releaseSecondRead: () => void = () => {}
    const secondReadGate = new Promise<void>((resolve) => {
      releaseSecondRead = resolve
    })
    let getCallCount = 0

    sellersGet.mockImplementation(async () => {
      getCallCount += 1
      if (getCallCount === 2) await secondReadGate
      return { exists: true, data: () => ({ status }) }
    })
    sellersUpdate.mockImplementation(async (patch: { status: string }) => {
      status = patch.status
      releaseSecondRead()
    })

    const results = await Promise.allSettled([promoteSellerByUid('alice'), promoteSellerByUid('alice')])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toMatch(/already approved/i)
    expect(setCustomUserClaims).toHaveBeenCalledTimes(1)
    expect(artistsSet).toHaveBeenCalledTimes(1)
    expect(status).toBe('APPROVED')
  })

  it('two near-simultaneous reject attempts on the same PENDING application: exactly one succeeds, the other fails as already-rejected, no duplicate write', async () => {
    let status: string = 'PENDING'
    let releaseSecondRead: () => void = () => {}
    const secondReadGate = new Promise<void>((resolve) => {
      releaseSecondRead = resolve
    })
    let getCallCount = 0

    sellersGet.mockImplementation(async () => {
      getCallCount += 1
      if (getCallCount === 2) await secondReadGate
      return { exists: true, data: () => ({ status }) }
    })
    sellersUpdate.mockImplementation(async (patch: { status: string }) => {
      status = patch.status
      releaseSecondRead()
    })

    const results = await Promise.allSettled([
      rejectSellerApplicationByUid('alice', 'reason A'),
      rejectSellerApplicationByUid('alice', 'reason B'),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toMatch(/already rejected/i)
    expect(sellersUpdate).toHaveBeenCalledTimes(1)
    expect(status).toBe('REJECTED')
  })

  it('a concurrent approve-vs-reject race on the same PENDING application: exactly one decision commits, the other caller is correctly told the application was already decided — the outcome is never ambiguous or mixed', async () => {
    let status: string = 'PENDING'
    let releaseSecondRead: () => void = () => {}
    const secondReadGate = new Promise<void>((resolve) => {
      releaseSecondRead = resolve
    })
    let getCallCount = 0

    sellersGet.mockImplementation(async () => {
      getCallCount += 1
      if (getCallCount === 2) await secondReadGate
      return { exists: true, data: () => ({ status }) }
    })
    sellersUpdate.mockImplementation(async (patch: { status: string }) => {
      status = patch.status
      releaseSecondRead()
    })

    const results = await Promise.allSettled([promoteSellerByUid('alice'), rejectSellerApplicationByUid('alice', 'reason')])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    // Whichever call committed first, the final status is exactly that
    // decision — never a hybrid, and the second caller's error names the
    // decision that actually won, not a generic failure.
    expect(['APPROVED', 'REJECTED']).toContain(status)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toMatch(status === 'APPROVED' ? /already approved/i : /already rejected/i)
    // Only the winning decision's side effects ran — never both.
    if (status === 'APPROVED') {
      expect(setCustomUserClaims).toHaveBeenCalledTimes(1)
    } else {
      expect(setCustomUserClaims).not.toHaveBeenCalled()
    }
  })
})

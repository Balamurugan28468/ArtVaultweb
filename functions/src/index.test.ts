import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleUserCreate } from './index'

const setCustomUserClaims = vi.fn()
const set = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ setCustomUserClaims }) }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({ set }) }) }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  setCustomUserClaims.mockClear()
  set.mockClear()
})

describe('handleUserCreate', () => {
  it('sets the default CUSTOMER role claim and creates the profile document', async () => {
    await handleUserCreate({ uid: 'alice', email: 'alice@example.com', displayName: 'Alice' })

    expect(setCustomUserClaims).toHaveBeenCalledWith('alice', { role: 'CUSTOMER' })
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        role: 'CUSTOMER',
      }),
    )
  })

  it('normalizes a missing email/displayName to null rather than undefined', async () => {
    await handleUserCreate({ uid: 'bob' })

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ email: null, displayName: null }))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideArtworkByArtworkId } from './publishArtwork'

const artworksGet = vi.fn()
const artworksUpdate = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'artworks') return { doc: () => ({ get: artworksGet, update: artworksUpdate }) }
      throw new Error(`unexpected collection: ${name}`)
    },
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  artworksGet.mockReset()
  artworksUpdate.mockClear()
})

describe('decideArtworkByArtworkId — publish', () => {
  it('publishes a SUBMITTED artwork, writing only status/reviewedAt/rejectionReason/updatedAt', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED', sellerId: 'alice', title: 'Sunset' }) })

    await decideArtworkByArtworkId('a1', 'PUBLISHED')

    expect(artworksUpdate).toHaveBeenCalledWith({
      status: 'PUBLISHED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('never touches sellerId, title, price, or any other field', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED', sellerId: 'alice', title: 'Sunset', price: 150000 }) })

    await decideArtworkByArtworkId('a1', 'PUBLISHED')

    const writtenKeys = Object.keys(artworksUpdate.mock.calls[0]?.[0] ?? {})
    expect(writtenKeys.sort()).toEqual(['rejectionReason', 'reviewedAt', 'status', 'updatedAt'])
  })

  it('refuses to publish an artwork that does not exist', async () => {
    artworksGet.mockResolvedValue({ exists: false })

    await expect(decideArtworkByArtworkId('missing', 'PUBLISHED')).rejects.toThrow(/no artwork found/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to publish a DRAFT artwork (invalid transition)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'DRAFT' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to re-publish an already-PUBLISHED artwork (idempotency guard, not a silent no-op)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PUBLISHED' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to publish an already-REJECTED artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'REJECTED' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })
})

describe('decideArtworkByArtworkId — reject', () => {
  it('rejects a SUBMITTED artwork with an optional reason', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })

    await decideArtworkByArtworkId('a1', 'REJECTED', { rejectionReason: 'blurry photos' })

    expect(artworksUpdate).toHaveBeenCalledWith({
      status: 'REJECTED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: 'blurry photos',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('rejects with a null reason when none is given', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })

    await decideArtworkByArtworkId('a1', 'REJECTED')

    expect(artworksUpdate).toHaveBeenCalledWith(expect.objectContaining({ rejectionReason: null }))
  })

  it('refuses to reject a DRAFT artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'DRAFT' }) })

    await expect(decideArtworkByArtworkId('a1', 'REJECTED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to reject an artwork that does not exist', async () => {
    artworksGet.mockResolvedValue({ exists: false })

    await expect(decideArtworkByArtworkId('missing', 'REJECTED')).rejects.toThrow(/no artwork found/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'

const { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } = vi.hoisted(() => ({
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  deleteDoc: vi.fn(),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(() => 'ORDER_BY'),
  query: vi.fn((ref) => ref),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { addAddress, deleteAddress, mapToAddress, setDefaultAddress, subscribeAddresses, toAddressError, updateAddress } =
  await import('./addressRepository')

function fakeBatch() {
  return { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }
}

const INPUT = {
  fullName: 'Ada Lovelace',
  addressLine1: '12 Analytical Ave',
  addressLine2: '',
  city: 'London',
  state: 'London',
  postalCode: 'SW1A 1AA',
  country: 'UK',
  phone: '',
  isDefault: false,
}

describe('mapToAddress', () => {
  it('maps a well-formed document', () => {
    expect(
      mapToAddress('a1', {
        fullName: 'Ada Lovelace',
        addressLine1: '12 Analytical Ave',
        city: 'London',
        state: 'London',
        postalCode: 'SW1A 1AA',
        country: 'UK',
        isDefault: true,
        createdAt: 'ts1',
        updatedAt: 'ts2',
      }),
    ).toEqual({
      id: 'a1',
      fullName: 'Ada Lovelace',
      addressLine1: '12 Analytical Ave',
      addressLine2: '',
      city: 'London',
      state: 'London',
      postalCode: 'SW1A 1AA',
      country: 'UK',
      phone: '',
      isDefault: true,
      createdAt: 'ts1',
      updatedAt: 'ts2',
    })
  })

  it('returns null when required fields are missing/malformed — never trusts a partial document', () => {
    expect(mapToAddress('a1', { addressLine1: '12 Analytical Ave' })).toBeNull()
    expect(mapToAddress('a1', { fullName: 'Ada' })).toBeNull()
    expect(mapToAddress('a1', { fullName: 123, addressLine1: 'x' })).toBeNull()
  })

  it('defensively defaults isDefault to false unless explicitly true', () => {
    expect(
      mapToAddress('a1', { fullName: 'Ada', addressLine1: '12 Analytical Ave', isDefault: 'yes' })?.isDefault,
    ).toBe(false)
  })
})

describe('subscribeAddresses', () => {
  it('subscribes exactly once, ordered, and maps every document', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({
        docs: [{ id: 'a1', data: () => ({ fullName: 'Ada', addressLine1: 'x', isDefault: true }) }],
      })
      return vi.fn()
    })
    subscribeAddresses('alice', onData, vi.fn())
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(onData).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a1', fullName: 'Ada', isDefault: true }),
    ])
  })

  it('filters out malformed documents rather than throwing', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'bad', data: () => ({}) }] })
      return vi.fn()
    })
    subscribeAddresses('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith([])
  })

  it('maps a listener error via toAddressError', () => {
    const onError = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, _onData, errorCallback: (error: unknown) => void) => {
      errorCallback({ code: 'permission-denied' })
      return vi.fn()
    })
    subscribeAddresses('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('addAddress', () => {
  it('creates the new address with server timestamps, in one committed batch', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await addAddress('alice', INPUT, [])
    expect(batch.set).toHaveBeenCalledWith(expect.anything(), {
      ...INPUT,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    })
    expect(batch.update).not.toHaveBeenCalled()
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('when isDefault is true, clears isDefault on every existing address in the same batch', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await addAddress('alice', { ...INPUT, isDefault: true }, ['other1', 'other2'])
    expect(batch.update).toHaveBeenCalledTimes(2)
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDefault: false, updatedAt: 'SERVER_TIMESTAMP' })
  })

  it('throws a typed error when the batch is rejected', async () => {
    const batch = fakeBatch()
    batch.commit.mockRejectedValueOnce({ code: 'permission-denied' })
    writeBatch.mockReturnValueOnce(batch)
    await expect(addAddress('alice', INPUT, [])).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('updateAddress', () => {
  it('merges the updated fields with a fresh updatedAt', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await updateAddress('alice', 'a1', INPUT, [])
    expect(batch.set).toHaveBeenCalledWith(expect.anything(), { ...INPUT, updatedAt: 'SERVER_TIMESTAMP' }, { merge: true })
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('when isDefault is true, clears every other address in the same batch', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await updateAddress('alice', 'a1', { ...INPUT, isDefault: true }, ['other1'])
    expect(batch.update).toHaveBeenCalledTimes(1)
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDefault: false, updatedAt: 'SERVER_TIMESTAMP' })
  })
})

describe('setDefaultAddress', () => {
  it('sets the target address default and clears every other in one atomic batch', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await setDefaultAddress('alice', 'a1', ['other1', 'other2'])
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDefault: true, updatedAt: 'SERVER_TIMESTAMP' })
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { isDefault: false, updatedAt: 'SERVER_TIMESTAMP' })
    expect(batch.update).toHaveBeenCalledTimes(3)
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })
})

describe('deleteAddress', () => {
  it('deletes the address document', async () => {
    deleteDoc.mockResolvedValueOnce(undefined)
    await deleteAddress('alice', 'a1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when denied', async () => {
    deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(deleteAddress('alice', 'a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('toAddressError', () => {
  it('maps network-related codes', () => {
    expect(toAddressError({ code: 'unavailable' })).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toAddressError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})

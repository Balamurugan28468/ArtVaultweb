import { beforeEach, expect, it, vi } from 'vitest'
import { getAccountStatus } from './accountAccess'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { maybeSingle, eq, select, from }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.maybeSingle.mockResolvedValue({ data: { id: 'buyer', status: 'ACTIVE' }, error: null }) })

it('loads only the authenticated UUID and protected account status, never credentials', async () => {
  expect(await getAccountStatus('buyer')).toBe('ACTIVE')
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith('profiles')
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith('id,status')
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('id', 'buyer')
})
it('returns suspension without interpreting an incomplete ordinary profile as bad credentials', async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: { id: 'buyer', status: 'SUSPENDED' }, error: null })
  expect(await getAccountStatus('buyer')).toBe('SUSPENDED')
})
it.each([null, { id: 'someone-else', status: 'ACTIVE' }, { id: 'buyer', status: 'unknown' }])('fails closed for missing, mismatched or unrecognized status', async (data) => {
  mocks.maybeSingle.mockResolvedValueOnce({ data, error: null })
  await expect(getAccountStatus('buyer')).rejects.toThrow('account status could not be verified')
})
it('does not expose raw database errors', async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'internal detail' } })
  await expect(getAccountStatus('buyer')).rejects.toThrow('Your account status could not be verified. Please try again.')
})

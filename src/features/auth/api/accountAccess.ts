import { createClient } from '@/lib/supabase/client'

/** Account status is protected database data, never browser-editable metadata. */
export async function getAccountStatus(userId: string): Promise<'ACTIVE' | 'SUSPENDED'> {
  const { data, error } = await createClient().from('profiles')
    .select('id,status').eq('id', userId).maybeSingle()
  if (error || !data || data.id !== userId || !['ACTIVE', 'SUSPENDED'].includes(data.status)) {
    throw new Error('Your account status could not be verified. Please try again.')
  }
  return data.status
}
